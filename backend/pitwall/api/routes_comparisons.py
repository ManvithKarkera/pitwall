import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import aws
from ..db import get_db
from ..models import Comparison, Lap, RaceSession, SessionResult, User, utcnow
from ..schemas import ComparisonIn, ComparisonOut
from ..security import current_user

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/comparisons", tags=["comparisons"])

ANALYSIS_VERSION = "v1"


def result_prefix(cache_key: str) -> str:
    return f"reports/{cache_key}"


def to_out(c: Comparison) -> ComparisonOut:
    done = c.status == "done"
    prefix = "/" + result_prefix(c.cache_key)
    return ComparisonOut(
        id=c.id, status=c.status, error=c.error,
        session_id=c.session_id, session_name=c.session.name,
        event_name=c.session.event.name, year=c.session.event.year,
        driver_a=c.driver_a, lap_a=c.lap_a, driver_b=c.driver_b, lap_b=c.lap_b,
        created_at=c.created_at, completed_at=c.completed_at,
        data_url=f"{prefix}/comparison.json" if done else None,
        report_url=f"{prefix}/report.pdf" if done else None,
        chart_url=f"{prefix}/chart.png" if done else None,
    )


def _resolve_lap(db: Session, session_id: int, driver: str, lap: int | None) -> int:
    if lap is None:
        result = db.scalar(
            select(SessionResult).where(SessionResult.session_id == session_id, SessionResult.driver_code == driver)
        )
        if result is None or result.best_lap_number is None:
            raise HTTPException(422, f"{driver} has no timed lap in this session")
        return result.best_lap_number
    timed = db.scalar(
        select(Lap.id).where(
            Lap.session_id == session_id, Lap.driver_code == driver, Lap.lap_number == lap, Lap.lap_time_ms.is_not(None)
        )
    )
    if timed is None:
        raise HTTPException(422, f"{driver} has no timed lap {lap} in this session")
    return lap


def _latest_with_key(db: Session, cache_key: str) -> Comparison | None:
    return db.scalar(
        select(Comparison)
        .where(Comparison.cache_key == cache_key, Comparison.status != "failed")
        .order_by(Comparison.id.desc())
        .limit(1)
    )


@router.post("", response_model=ComparisonOut, status_code=status.HTTP_201_CREATED)
def create(body: ComparisonIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if db.get(RaceSession, body.session_id) is None:
        raise HTTPException(404, "Session not found")
    a, b = body.driver_a.upper(), body.driver_b.upper()
    lap_a = _resolve_lap(db, body.session_id, a, body.lap_a)
    lap_b = _resolve_lap(db, body.session_id, b, body.lap_b)
    if (a, lap_a) == (b, lap_b):
        raise HTTPException(422, "Pick two different laps")

    key = hashlib.sha256(f"{ANALYSIS_VERSION}:{body.session_id}:{a}:{lap_a}:{b}:{lap_b}".encode()).hexdigest()
    existing = _latest_with_key(db, key)

    c = Comparison(user_id=user.id, session_id=body.session_id, driver_a=a, lap_a=lap_a, driver_b=b, lap_b=lap_b, cache_key=key)
    if existing and existing.status == "done":
        # Already analysed by someone: reuse the S3 result, no compute needed.
        c.status, c.completed_at = "done", utcnow()
        log.info("Cache hit for comparison key %s", key[:12])
    elif existing:
        c.status = existing.status  # same job is already queued/processing; the worker updates every row with this key
    db.add(c)
    db.commit()

    if existing is None:
        try:
            aws.send_job({"type": "compare", "cache_key": key})
        except Exception:
            log.exception("Could not queue comparison %s", c.id)
            c.status, c.error = "failed", "Could not queue the job, please try again"
            db.commit()
    elif c.status != "done":
        # The in-flight job may have finished between our check and insert.
        db.refresh(existing)
        if existing.status == "done":
            c.status, c.completed_at = "done", utcnow()
            db.commit()
    return to_out(c)


@router.get("", response_model=list[ComparisonOut])
def mine(user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Comparison).where(Comparison.user_id == user.id).order_by(Comparison.id.desc()).limit(100)
    return [to_out(c) for c in db.scalars(stmt)]


@router.get("/{comparison_id}", response_model=ComparisonOut)
def detail(comparison_id: int, db: Session = Depends(get_db)):
    """Public on purpose, so comparisons can be shared by link."""
    c = db.get(Comparison, comparison_id)
    if c is None:
        raise HTTPException(404, "Comparison not found")
    return to_out(c)
