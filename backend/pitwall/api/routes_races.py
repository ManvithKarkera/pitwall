from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Event, Lap, RaceSession
from ..schemas import EventOut, LapOut, SessionOut

router = APIRouter(prefix="/api", tags=["races"])


@router.get("/seasons", response_model=list[int])
def seasons(db: Session = Depends(get_db)):
    return list(db.scalars(select(Event.year).distinct().order_by(Event.year.desc())))


@router.get("/events", response_model=list[EventOut])
def events(year: int, db: Session = Depends(get_db)):
    stmt = (
        select(Event)
        .where(Event.year == year)
        .options(selectinload(Event.sessions))
        .order_by(Event.round.desc())
    )
    return list(db.scalars(stmt))


@router.get("/sessions/{session_id}", response_model=SessionOut)
def session_detail(session_id: int, db: Session = Depends(get_db)):
    s = db.get(RaceSession, session_id)
    if s is None:
        raise HTTPException(404, "Session not found")
    return SessionOut(
        id=s.id, code=s.code, name=s.name, starts_at=s.starts_at,
        event=EventOut.model_validate(s.event), results=s.results,
    )


@router.get("/sessions/{session_id}/laps", response_model=list[LapOut])
def session_laps(session_id: int, driver: str, db: Session = Depends(get_db)):
    stmt = (
        select(Lap)
        .where(Lap.session_id == session_id, Lap.driver_code == driver.upper())
        .order_by(Lap.lap_number)
    )
    return list(db.scalars(stmt))


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    """Small numbers for the home page."""
    return {
        "events": db.scalar(select(func.count(Event.id))),
        "sessions": db.scalar(select(func.count(RaceSession.id))),
        "laps": db.scalar(select(func.count(Lap.id))),
    }
