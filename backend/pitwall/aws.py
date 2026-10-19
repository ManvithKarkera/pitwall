"""Thin wrappers around S3, SQS and SNS.

boto3 picks up credentials from the EC2 instance role automatically.
Nothing here reads or stores access keys.
"""

import gzip
import json
import logging
from functools import lru_cache
from typing import Any

import boto3
from botocore.exceptions import ClientError

from .config import get_settings

log = logging.getLogger(__name__)


def _client(service: str):
    s = get_settings()
    return boto3.client(service, region_name=s.aws_region, endpoint_url=s.aws_endpoint_url or None)


@lru_cache
def s3():
    return _client("s3")


@lru_cache
def sqs():
    return _client("sqs")


@lru_cache
def sns():
    return _client("sns")


# ---------- S3 ----------

def put_bytes(key: str, body: bytes, content_type: str, gzipped: bool = False) -> None:
    extra = {"ContentEncoding": "gzip"} if gzipped else {}
    s3().put_object(Bucket=get_settings().s3_bucket, Key=key, Body=body, ContentType=content_type, **extra)


def put_json(key: str, data: Any, gzipped: bool = False) -> None:
    body = json.dumps(data, separators=(",", ":")).encode()
    if gzipped:
        body = gzip.compress(body)
    put_bytes(key, body, "application/json", gzipped=gzipped)


def get_json(key: str) -> Any | None:
    try:
        obj = s3().get_object(Bucket=get_settings().s3_bucket, Key=key)
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return None
        raise
    body = obj["Body"].read()
    if obj.get("ContentEncoding") == "gzip" or body[:2] == b"\x1f\x8b":
        body = gzip.decompress(body)
    return json.loads(body)


# ---------- SQS ----------

def send_job(job: dict) -> None:
    sqs().send_message(QueueUrl=get_settings().sqs_queue_url, MessageBody=json.dumps(job))


# ---------- SNS ----------
# One topic for user notifications. Each user's email subscription has a
# filter policy on user_id, so a message published with user_id=7 is only
# delivered to user 7.

def subscribe_user(user_id: int, email: str) -> None:
    topic = get_settings().sns_topic_arn
    if not topic:
        log.info("SNS disabled; skipping subscription for user %s", user_id)
        return
    sns().subscribe(
        TopicArn=topic,
        Protocol="email",
        Endpoint=email,
        Attributes={"FilterPolicy": json.dumps({"user_id": [str(user_id)]})},
    )


def notify_user(user_id: int, subject: str, message: str) -> None:
    topic = get_settings().sns_topic_arn
    if not topic:
        log.info("SNS disabled; would notify user %s: %s", user_id, subject)
        return
    sns().publish(
        TopicArn=topic,
        Subject=subject[:100],
        Message=message,
        MessageAttributes={"user_id": {"DataType": "String", "StringValue": str(user_id)}},
    )
