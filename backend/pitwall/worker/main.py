"""SQS consumer: runs lap comparisons and session ingestion jobs.

Job messages:
    {"type": "compare", "cache_key": "<sha256>"}
    {"type": "ingest_session", "session_key": 9586}   (OpenF1 session key; from seed.py or the scheduler Lambda)
"""

import gc
import json
import logging
import signal
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import aws
from ..config import get_settings
from ..db import get_sessionmaker, init_db
from ..logging_setup import setup_logging
from ..models import Comparison, Lap, SessionResult, User, utcnow
from . import openf1, report
from .analysis import compare_laps

log = logging.getLogger("pitwall.worker")

# Must match maxReceiveCount on the queue's redrive policy (infra/pitwall.yaml).
MAX_ATTEMPTS = 3
FALLBACK_COLOR = "#8a8f98"

_running = True


def _stop(*_):
    global _running
    _running = False
    log.info("Shutdown requested, finishing current job")


def _lap_info(db: Session, session_id: int, driver: str, lap_number: int) -> dict:
    lap = db.scalar(select(Lap).where(Lap.session_id == session_id, Lap.driver_code == driver, Lap.lap_number == lap_number))
    if lap is None:
        return {}
    return {
        "lap_time_s": lap.lap_time_ms / 1000 if lap.lap_time_ms else None,
        "sector1_ms": lap.sector1_ms,
        "sector2_ms": lap.sector2_ms,
        "sector3_ms": lap.sector3_ms,
        "compound": lap.compound,
        "tyre_life": lap.tyre_life,
    }


def _driver(db: Session, session_id: int, code: str) -> SessionResult | None:
    return db.scalar(select(SessionResult).where(SessionResult.session_id == session_id, SessionResult.driver_code == code))


def _pending(db: Session, cache_key: str) -> list[Comparison]:
    return list(db.scalars(
        select(Comparison).where(Comparison.cache_key == cache_key, Comparison.status.in_(("queued", "processing")))
    ))


def run_comparison(db: Session, cache_key: str) -> None:
    rows = _pending(db, cache_key)
    if not rows:
        log.info("Nothing pending for %s, skipping", cache_key[:12])
        return
    for r in rows:
        r.status = "processing"
    db.commit()

    c = rows[0]
    rs, event = c.session, c.session.event
    started = time.perf_counter()

    da, db_ = _driver(db, rs.id, c.driver_a), _driver(db, rs.id, c.driver_b)

    telemetry = []
    for driver, lap_number, result in ((c.driver_a, c.lap_a, da), (c.driver_b, c.lap_b, db_)):
        key = f"telemetry/{event.year}/{event.round:02d}/{rs.code}/{driver}/{lap_number}.json.gz"
        tel = aws.get_json(key)
        if tel is None:
            lap = db.scalar(select(Lap).where(Lap.session_id == rs.id, Lap.driver_code == driver, Lap.lap_number == lap_number))
            if lap is None or lap.started_at is None or not lap.lap_time_ms or result is None:
                raise ValueError(f"No timing for {driver} lap {lap_number}")
            log.info("Downloading telemetry for %s lap %d", driver, lap_number)
            tel = openf1.lap_telemetry(rs.external_key, result.driver_number, lap.started_at, lap.lap_time_ms / 1000)
            aws.put_json(key, tel, gzipped=True)
        else:
            log.info("Telemetry cache hit %s", key)
        telemetry.append(tel)

    color_a = da.team_color if da else FALLBACK_COLOR
    color_b = db_.team_color if db_ else FALLBACK_COLOR
    if color_b.lower() == color_a.lower():
        color_b = FALLBACK_COLOR  # teammates: keep the two traces distinguishable

    meta = {
        "year": event.year, "event_name": event.name, "session_name": rs.name,
        "driver_a": c.driver_a, "driver_b": c.driver_b,
        "name_a": da.full_name if da else c.driver_a, "name_b": db_.full_name if db_ else c.driver_b,
        "team_a": da.team if da else "", "team_b": db_.team if db_ else "",
        "lap_a": c.lap_a, "lap_b": c.lap_b,
        "color_a": color_a, "color_b": color_b,
        "lap_a_info": _lap_info(db, rs.id, c.driver_a, c.lap_a),
        "lap_b_info": _lap_info(db, rs.id, c.driver_b, c.lap_b),
    }
    result = compare_laps(telemetry[0], telemetry[1])
    result["meta"] = meta

    chart = report.telemetry_chart(result, meta)
    track = report.track_map(result, meta)
    pdf = report.pdf_report(result, meta, chart, track)

    prefix = f"reports/{cache_key}"
    aws.put_json(f"{prefix}/comparison.json", result, gzipped=True)
    aws.put_bytes(f"{prefix}/chart.png", chart, "image/png")
    aws.put_bytes(f"{prefix}/track.png", track, "image/png")
    aws.put_bytes(f"{prefix}/report.pdf", pdf, "application/pdf")

    # Re-read: more users may have asked for the same laps while we worked.
    rows = _pending(db, cache_key)
    now = utcnow()
    for r in rows:
        r.status, r.completed_at = "done", now
    db.commit()
    log.info("Comparison %s done in %.1fs (%d requests)", cache_key[:12], time.perf_counter() - started, len(rows))

    base = get_settings().public_url.rstrip("/")
    for r in rows:
        user = db.get(User, r.user_id)
        if user and user.notify_email:
            aws.notify_user(
                user.id,
                f"PitWall: {r.driver_a} vs {r.driver_b} is ready",
                f"Your comparison of {r.driver_a} lap {r.lap_a} and {r.driver_b} lap {r.lap_b} "
                f"({event.year} {event.name}, {rs.name}) is ready.\n\n"
                f"Open it: {base}/#/comparisons/{r.id}\n"
                f"PDF report: {base}/{prefix}/report.pdf\n",
            )


def fail_comparison(db: Session, cache_key: str, message: str) -> None:
    for r in _pending(db, cache_key):
        r.status, r.error = "failed", message[:500]
    db.commit()


def handle(job: dict, attempt: int) -> None:
    with get_sessionmaker()() as db:
        try:
            if job["type"] == "compare":
                run_comparison(db, job["cache_key"])
            elif job["type"] == "ingest_session":
                openf1.ingest_session(db, int(job["session_key"]))
            else:
                log.warning("Unknown job type %r, dropping", job.get("type"))
        except Exception as exc:
            db.rollback()
            if job.get("type") == "compare":
                if attempt >= MAX_ATTEMPTS:
                    fail_comparison(db, job["cache_key"], f"Analysis failed: {exc}")
                else:
                    for r in _pending(db, job["cache_key"]):
                        r.status = "queued"
                    db.commit()
            raise


def main() -> None:
    setup_logging("worker")
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    init_db()
    queue_url = get_settings().sqs_queue_url
    log.info("Worker started, polling %s", queue_url)

    while _running:
        resp = aws.sqs().receive_message(
            QueueUrl=queue_url, MaxNumberOfMessages=1, WaitTimeSeconds=20,
            AttributeNames=["ApproximateReceiveCount"],
        )
        for msg in resp.get("Messages", []):
            attempt = int(msg.get("Attributes", {}).get("ApproximateReceiveCount", 1))
            try:
                job = json.loads(msg["Body"])
            except json.JSONDecodeError:
                log.error("Malformed job body, deleting: %r", msg["Body"][:200])
                aws.sqs().delete_message(QueueUrl=queue_url, ReceiptHandle=msg["ReceiptHandle"])
                continue
            started = time.perf_counter()
            try:
                handle(job, attempt)
                aws.sqs().delete_message(QueueUrl=queue_url, ReceiptHandle=msg["ReceiptHandle"])
                log.info("Job %s finished in %.1fs", job.get("type"), time.perf_counter() - started)
            except Exception:
                # Not deleted: SQS makes it visible again for a retry, and after
                # MAX_ATTEMPTS the redrive policy moves it to the dead-letter queue.
                log.exception("Job %s failed (attempt %d/%d): %s", job.get("type"), attempt, MAX_ATTEMPTS, job)
            finally:
                gc.collect()


if __name__ == "__main__":
    main()
