import json

import boto3

from pitwall import aws
from pitwall.db import get_sessionmaker
from tests.test_analysis import synthetic_lap


def register(client, email="fan@example.com"):
    r = client.post("/api/auth/register", json={"email": email, "password": "password123", "display_name": "Fan"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def queued_jobs(queue_url):
    msgs = boto3.client("sqs", region_name="us-east-1").receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10)
    return [json.loads(m["Body"]) for m in msgs.get("Messages", [])]


def test_register_login_and_me(client):
    register(client)
    assert client.post("/api/auth/register", json={"email": "FAN@example.com", "password": "password123", "display_name": "x"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "fan@example.com", "password": "wrong-pass"}).status_code == 401
    token = client.post("/api/auth/login", json={"email": "fan@example.com", "password": "password123"}).json()["token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["email"] == "fan@example.com"
    assert client.get("/api/auth/me").status_code == 401


def test_browse_races(client, monza):
    assert client.get("/api/seasons").json() == [2024]
    events = client.get("/api/events", params={"year": 2024}).json()
    assert events[0]["name"] == "Italian Grand Prix"
    assert events[0]["sessions"][0]["code"] == "Q"
    detail = client.get(f"/api/sessions/{monza}").json()
    assert {r["driver_code"] for r in detail["results"]} == {"NOR", "LEC"}
    laps = client.get(f"/api/sessions/{monza}/laps", params={"driver": "nor"}).json()
    assert [lap["lap_number"] for lap in laps] == [1, 2, 3]


def test_comparison_requires_login_and_valid_laps(client, monza):
    body = {"session_id": monza, "driver_a": "NOR", "driver_b": "LEC"}
    assert client.post("/api/comparisons", json=body).status_code == 401
    h = register(client)
    assert client.post("/api/comparisons", json={**body, "lap_a": 99}, headers=h).status_code == 422
    assert client.post("/api/comparisons", json={**body, "driver_b": "NOR"}, headers=h).status_code == 422


def test_full_comparison_flow_with_cache(client, monza, aws_env):
    from pitwall.worker.main import run_comparison

    h1, h2 = register(client, "a@example.com"), register(client, "b@example.com")
    body = {"session_id": monza, "driver_a": "NOR", "driver_b": "LEC"}

    # First request: fastest laps resolved, job queued.
    first = client.post("/api/comparisons", json=body, headers=h1).json()
    assert (first["lap_a"], first["lap_b"], first["status"]) == (3, 2, "queued")
    jobs = queued_jobs(aws_env)
    assert len(jobs) == 1 and jobs[0]["type"] == "compare"

    # Same laps from another user while in flight: no second job.
    second = client.post("/api/comparisons", json={**body, "lap_a": 3, "lap_b": 2}, headers=h2).json()
    assert second["status"] == "queued"
    assert queued_jobs(aws_env) == []

    # Worker: telemetry already cached in S3, so FastF1 is never touched.
    aws.put_json("telemetry/2024/16/Q/NOR/3.json.gz", synthetic_lap(), gzipped=True)
    aws.put_json("telemetry/2024/16/Q/LEC/2.json.gz", synthetic_lap(slow_zone=(1000, 1200), slow_factor=0.8), gzipped=True)
    with get_sessionmaker()() as db:
        run_comparison(db, jobs[0]["cache_key"])

    for c in (first, second):
        done = client.get(f"/api/comparisons/{c['id']}").json()
        assert done["status"] == "done"
        assert done["report_url"].endswith("/report.pdf")

    s3 = boto3.client("s3", region_name="us-east-1")
    prefix = done["report_url"].lstrip("/").rsplit("/", 1)[0]
    keys = {o["Key"].rsplit("/", 1)[1] for o in s3.list_objects_v2(Bucket="pitwall-test", Prefix=prefix)["Contents"]}
    assert keys == {"comparison.json", "chart.png", "track.png", "report.pdf"}
    result = aws.get_json(f"{prefix}/comparison.json")
    assert result["final_delta_s"] > 0 and result["meta"]["color_a"] == "#ff8000"

    # Third request after completion: instant cache hit, nothing queued.
    third = client.post("/api/comparisons", json=body, headers=h1).json()
    assert third["status"] == "done"
    assert queued_jobs(aws_env) == []
    assert len(client.get("/api/comparisons", headers=h1).json()) == 2


def test_comparison_detail_includes_driver_photos(client, monza):
    from pitwall.models import Comparison, RaceSession, SessionResult, User

    with get_sessionmaker()() as db:
        # LEC's photo only exists on a later session: the lookup falls back to it.
        ev = db.get(RaceSession, monza).event
        later = RaceSession(external_key=9999, event_id=ev.id, code="R", name="Race")
        db.add(later)
        db.flush()
        db.add(SessionResult(session_id=later.id, driver_code="LEC", driver_number="16", full_name="Charles Leclerc",
                             team="Ferrari", team_color="#e8002d", headshot_url="https://img.example/lec.png"))
        nor = db.query(SessionResult).filter_by(session_id=monza, driver_code="NOR").one()
        nor.headshot_url = "https://img.example/nor.png"
        user = User(email="x@example.com", display_name="X", password_hash="x")
        db.add(user)
        db.flush()
        c = Comparison(user_id=user.id, session_id=monza, driver_a="NOR", lap_a=3, driver_b="LEC", lap_b=2, cache_key="k")
        db.add(c)
        db.commit()
        cid = c.id

    body = client.get(f"/api/comparisons/{cid}").json()
    assert body["headshot_a"] == "https://img.example/nor.png"
    assert body["headshot_b"] == "https://img.example/lec.png"
