from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(100))
    notify_email: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Event(Base):
    """A race weekend, e.g. 2024 round 16, Italian Grand Prix."""

    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    external_key: Mapped[int] = mapped_column(Integer, unique=True)  # OpenF1 meeting_key
    year: Mapped[int] = mapped_column(Integer, index=True)
    round: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(120))
    country: Mapped[str] = mapped_column(String(80))
    location: Mapped[str] = mapped_column(String(80))
    event_date: Mapped[date] = mapped_column(Date)

    sessions: Mapped[list["RaceSession"]] = relationship(back_populates="event", order_by="RaceSession.starts_at")


class RaceSession(Base):
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    external_key: Mapped[int] = mapped_column(Integer, unique=True)  # OpenF1 session_key
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    code: Mapped[str] = mapped_column(String(4))  # Q, R, S, SQ
    name: Mapped[str] = mapped_column(String(40))
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    event: Mapped[Event] = relationship(back_populates="sessions")
    results: Mapped[list["SessionResult"]] = relationship(order_by="SessionResult.position", cascade="all, delete-orphan")


class SessionResult(Base):
    __tablename__ = "session_results"
    __table_args__ = (UniqueConstraint("session_id", "driver_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    driver_code: Mapped[str] = mapped_column(String(3))
    driver_number: Mapped[str] = mapped_column(String(3))
    full_name: Mapped[str] = mapped_column(String(80))
    team: Mapped[str] = mapped_column(String(80))
    team_color: Mapped[str] = mapped_column(String(7))
    position: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(40), default="")
    best_lap_ms: Mapped[int | None] = mapped_column(Integer)
    best_lap_number: Mapped[int | None] = mapped_column(Integer)


class Lap(Base):
    __tablename__ = "laps"
    __table_args__ = (UniqueConstraint("session_id", "driver_code", "lap_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    driver_code: Mapped[str] = mapped_column(String(3))
    lap_number: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lap_time_ms: Mapped[int | None] = mapped_column(Integer)
    sector1_ms: Mapped[int | None] = mapped_column(Integer)
    sector2_ms: Mapped[int | None] = mapped_column(Integer)
    sector3_ms: Mapped[int | None] = mapped_column(Integer)
    compound: Mapped[str] = mapped_column(String(12), default="")
    tyre_life: Mapped[int | None] = mapped_column(Integer)


class Comparison(Base):
    """One user's request to compare two laps.

    Requests for the same laps share a cache_key, so the telemetry is only
    processed once and every requester points at the same S3 result.
    """

    __tablename__ = "comparisons"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"))
    driver_a: Mapped[str] = mapped_column(String(3))
    lap_a: Mapped[int] = mapped_column(Integer)
    driver_b: Mapped[str] = mapped_column(String(3))
    lap_b: Mapped[int] = mapped_column(Integer)
    cache_key: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(12), default="queued")  # queued|processing|done|failed
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    session: Mapped[RaceSession] = relationship()
