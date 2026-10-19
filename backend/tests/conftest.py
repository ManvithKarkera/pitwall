import os
from datetime import date

import boto3
import pytest
from moto import mock_aws

os.environ.update(
    DATABASE_URL="sqlite:///./.pytest_cache/test.db",
    AWS_REGION="us-east-1",
    AWS_DEFAULT_REGION="us-east-1",
    AWS_ACCESS_KEY_ID="testing",
    AWS_SECRET_ACCESS_KEY="testing",
    AWS_ENDPOINT_URL="",
    S3_BUCKET="pitwall-test",
    SNS_TOPIC_ARN="",
    JWT_SECRET="test-secret",
)


@pytest.fixture()
def aws_env():
    with mock_aws():
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="pitwall-test")
        queue = boto3.client("sqs", region_name="us-east-1").create_queue(QueueName="jobs")["QueueUrl"]
        os.environ["SQS_QUEUE_URL"] = queue

        from pitwall import aws, config, db

        for fn in (config.get_settings, db.get_engine, db.get_sessionmaker, aws.s3, aws.sqs, aws.sns):
            fn.cache_clear()
        yield queue


@pytest.fixture()
def database(aws_env):
    from pitwall.db import Base, get_engine, init_db

    os.makedirs(".pytest_cache", exist_ok=True)
    init_db()
    yield
    Base.metadata.drop_all(get_engine())
    get_engine().dispose()


@pytest.fixture()
def client(database):
    from fastapi.testclient import TestClient

    from pitwall.api.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture()
def monza(database):
    """One qualifying session with two drivers and a few laps."""
    from pitwall.db import get_sessionmaker
    from pitwall.models import Event, Lap, RaceSession, SessionResult

    with get_sessionmaker()() as db:
        ev = Event(external_key=1244, year=2024, round=16, name="Italian Grand Prix", country="Italy", location="Monza", event_date=date(2024, 9, 1))
        db.add(ev)
        db.flush()
        s = RaceSession(external_key=9586, event_id=ev.id, code="Q", name="Qualifying")
        db.add(s)
        db.flush()
        for code, team, color, best in (("NOR", "McLaren", "#ff8000", 3), ("LEC", "Ferrari", "#e8002d", 2)):
            db.add(SessionResult(session_id=s.id, driver_code=code, driver_number="1", full_name=code, team=team,
                                 team_color=color, position=1, status="", best_lap_ms=79300, best_lap_number=best))
            for n in (1, 2, 3):
                db.add(Lap(session_id=s.id, driver_code=code, lap_number=n, lap_time_ms=79300 + n,
                           sector1_ms=26000, sector2_ms=27000, sector3_ms=26300, compound="SOFT", tyre_life=n))
        db.commit()
        return s.id
