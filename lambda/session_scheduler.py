"""Weekly EventBridge-triggered Lambda.

Finds F1 sessions (qualifying, sprint, race) that finished in the last
LOOKBACK_DAYS days and puts one ingest job per session on the SQS queue.
The EC2 worker does the actual download and database writes, so this function
needs no VPC access and no database credentials: only sqs:SendMessage.
"""

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

SESSION_NAMES = {"Qualifying", "Race", "Sprint", "Sprint Qualifying", "Sprint Shootout"}
sqs = boto3.client("sqs")


def fetch_sessions(year: int, since: datetime) -> list[dict]:
    stamp = urllib.parse.quote(since.strftime("%Y-%m-%dT%H:%M:%S"))
    url = f"https://api.openf1.org/v1/sessions?year={year}&date_end>={stamp}"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:  # OpenF1: "No results found."
            return []
        raise


def handler(event, context):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=int(os.environ.get("LOOKBACK_DAYS", "8")))
    years = sorted({since.year, now.year})

    queued = []
    for year in years:
        for s in fetch_sessions(year, since):
            if s.get("session_name") not in SESSION_NAMES or s.get("is_cancelled"):
                continue
            if datetime.fromisoformat(s["date_end"]) > now - timedelta(hours=1):
                continue  # not finished yet; next week's run (or a manual run) picks it up
            sqs.send_message(
                QueueUrl=os.environ["QUEUE_URL"],
                MessageBody=json.dumps({"type": "ingest_session", "session_key": s["session_key"]}),
            )
            queued.append(f"{s['year']} {s['location']} {s['session_name']}")

    print(json.dumps({"queued": len(queued), "sessions": queued}))
    return {"queued": len(queued), "sessions": queued}
