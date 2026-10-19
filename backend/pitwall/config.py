"""Application settings.

Locally, settings come from environment variables (see .env.example).
On EC2, SSM_PREFIX is set and every parameter under that path in
Systems Manager Parameter Store is loaded using the instance's IAM role,
so no credentials or secrets live in the code or on disk.
"""

import logging
import os
from functools import lru_cache
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    aws_region: str = "ap-south-1"
    # Only set for local development (MinIO / ElasticMQ). Empty on AWS.
    aws_endpoint_url: str = ""

    database_url: str = ""
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "pitwall"
    db_user: str = "pitwall"
    db_password: str = ""

    jwt_secret: str = "dev-only-secret-change-me"
    jwt_ttl_hours: int = 24 * 7

    s3_bucket: str = "pitwall"
    sqs_queue_url: str = ""
    sns_topic_arn: str = ""
    # Base URL users open the site on (CloudFront domain on AWS); used in notification emails.
    public_url: str = "http://localhost:5173"

    log_level: str = "INFO"
    # Local development only: the API serves /reports/* from S3 because there
    # is no CloudFront in front of it. Always false on AWS.
    serve_reports_locally: bool = False

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.db_user}:{quote_plus(self.db_password)}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


def _load_ssm_parameters(prefix: str, region: str) -> dict[str, str]:
    """Read /pitwall/db/password -> db_password, /pitwall/s3_bucket -> s3_bucket, ..."""
    import boto3

    client = boto3.client("ssm", region_name=region)
    values: dict[str, str] = {}
    paginator = client.get_paginator("get_parameters_by_path")
    for page in paginator.paginate(Path=prefix, Recursive=True, WithDecryption=True):
        for param in page["Parameters"]:
            key = param["Name"][len(prefix):].strip("/").replace("/", "_").lower()
            values[key] = param["Value"]
    log.info("Loaded %d parameters from SSM path %s", len(values), prefix)
    return values


@lru_cache
def get_settings() -> Settings:
    prefix = os.environ.get("SSM_PREFIX")
    if prefix:
        region = os.environ.get("AWS_REGION", Settings().aws_region)
        return Settings(**_load_ssm_parameters(prefix, region))
    return Settings()
