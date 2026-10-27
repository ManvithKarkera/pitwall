"""Everything that talks to OpenF1 (https://openf1.org), the public F1 timing API.

Historical data (2023 onward) needs no API key. The free tier is rate limited,
so requests are spaced out and retried on HTTP 429.
"""

import json
import logging
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..models import Event, Lap, RaceSession, SessionResult, Standing, utcnow

log = logging.getLogger(__name__)

BASE_URL = "https://api.openf1.org/v1"
MIN_INTERVAL_S = 0.4

# OpenF1 session_name -> code we store
SESSION_CODES = {
    "Qualifying": "Q",
    "Race": "R",
    "Sprint": "S",
    "Sprint Qualifying": "SQ",
    "Sprint Shootout": "SQ",
}

_last_call = 0.0


def get(endpoint: str, *filters: str, **params) -> list[dict]:
    """GET /v1/<endpoint>. `filters` are raw OpenF1 comparisons like 'date>=2024-08-31T14:00'."""
    global _last_call
    parts = [f"{k}={quote(str(v))}" for k, v in params.items()]
    parts += [f[: f.index("=") + 1] + quote(f[f.index("=") + 1:]) if "=" in f else f for f in filters]
    url = f"{BASE_URL}/{endpoint}?{'&'.join(parts)}"
    for attempt in range(5):
        wait = _last_call + MIN_INTERVAL_S - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:  # OpenF1 answers 404 "No results found."
                return []
            if e.code == 429 and attempt < 4:  # rate limited: honour Retry-After, else back off 5/10/20/40 s
                retry_after = e.headers.get("Retry-After", "") if e.headers else ""
                time.sleep(float(retry_after) if retry_after.isdigit() else 5 * 2 ** attempt)
                continue
            if e.code in (500, 502, 503, 504) and attempt < 4:
                time.sleep(2 ** attempt * 2)
                continue
            raise
    raise RuntimeError("unreachable")


def tyre_on_lap(stints: list[dict], driver_number: int, lap_number: int) -> tuple[str, int | None]:
    """Compound and tyre age for a lap. OpenF1 sometimes sends stints without lap_start; those are skipped."""
    for st in stints:
        start = st.get("lap_start")
        if st["driver_number"] != driver_number or start is None:
            continue
        if start <= lap_number <= (st.get("lap_end") or 999):
            return st.get("compound") or "", (st.get("tyre_age_at_start") or 0) + lap_number - start
    return "", None


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(timezone.utc)


def finished_sessions(year: int, codes: set[str], since: datetime | None = None) -> list[dict]:
    now = datetime.now(timezone.utc)
    out = []
    for s in get("sessions", year=year):
        code = SESSION_CODES.get(s["session_name"])
        if code not in codes or s.get("is_cancelled") or not s.get("date_end"):
            continue
        end = parse_time(s["date_end"])
        if end + timedelta(hours=1) < now and (since is None or end >= since):
            out.append(s)
    return out


def _round_number(year: int, meeting_key: int) -> int:
    meetings = [m for m in get("meetings", year=year) if "testing" not in m["meeting_name"].lower()]
    meetings.sort(key=lambda m: m["date_start"])
    for i, m in enumerate(meetings, start=1):
        if m["meeting_key"] == meeting_key:
            return i
    return 0


def ingest_session(db: Session, session_key: int) -> RaceSession:
    """Download classification, laps and tyres for one session and upsert them into RDS."""
    sessions = get("sessions", session_key=session_key)
    if not sessions:
        raise ValueError(f"OpenF1 has no session {session_key}")
    s = sessions[0]
    meeting = get("meetings", meeting_key=s["meeting_key"])[0]
    year = int(s["year"])

    event = db.scalar(select(Event).where(Event.external_key == s["meeting_key"]))
    if event is None:
        event = Event(external_key=s["meeting_key"], year=year, round=_round_number(year, s["meeting_key"]))
        db.add(event)
    event.name = meeting["meeting_name"]
    event.country = meeting["country_name"]
    event.location = meeting["location"]
    event.event_date = parse_time(s["date_start"]).date()
    db.flush()

    rs = db.scalar(select(RaceSession).where(RaceSession.external_key == session_key))
    if rs is None:
        rs = RaceSession(external_key=session_key, event_id=event.id, code=SESSION_CODES[s["session_name"]])
        db.add(rs)
    rs.name = s["session_name"]
    rs.starts_at = parse_time(s["date_start"])
    rs.ingested_at = utcnow()
    db.flush()

    drivers = {d["driver_number"]: d for d in get("drivers", session_key=session_key)}
    results = {r["driver_number"]: r for r in get("session_result", session_key=session_key)}
    laps = get("laps", session_key=session_key)
    stints = get("stints", session_key=session_key)

    db.execute(delete(Lap).where(Lap.session_id == rs.id))
    db.execute(delete(SessionResult).where(SessionResult.session_id == rs.id))

    best: dict[int, dict] = {}
    for lap in laps:
        n = lap["driver_number"]
        if n not in drivers or lap.get("lap_number") is None:
            continue
        if lap.get("lap_duration") and (n not in best or lap["lap_duration"] < best[n]["lap_duration"]):
            best[n] = lap
        compound, life = tyre_on_lap(stints, n, lap["lap_number"])
        db.add(Lap(
            session_id=rs.id,
            driver_code=drivers[n]["name_acronym"],
            lap_number=lap["lap_number"],
            started_at=parse_time(lap["date_start"]) if lap.get("date_start") else None,
            lap_time_ms=_ms(lap.get("lap_duration")),
            sector1_ms=_ms(lap.get("duration_sector_1")),
            sector2_ms=_ms(lap.get("duration_sector_2")),
            sector3_ms=_ms(lap.get("duration_sector_3")),
            compound=compound,
            tyre_life=life,
        ))

    for n, d in drivers.items():
        r = results.get(n, {})
        status = next((label for label in ("DSQ", "DNS", "DNF") if r.get(label.lower())), "")
        position = r.get("position")
        if not isinstance(position, int):
            # OpenF1 occasionally reports a classification code (e.g. "RT") instead of a number.
            status = status or (str(position) if position else "")
            position = int(position) if str(position).isdigit() else None
        colour = d.get("team_colour") or ""
        db.add(SessionResult(
            session_id=rs.id,
            driver_code=d["name_acronym"],
            driver_number=str(n),
            full_name=d["full_name"].title(),
            team=d.get("team_name") or "",
            team_color="#" + colour if len(colour) == 6 else "#888888",
            position=position,
            status=status,
            best_lap_ms=_ms(best[n]["lap_duration"]) if n in best else None,
            best_lap_number=best[n]["lap_number"] if n in best else None,
            headshot_url=d.get("headshot_url") or None,
        ))
    db.commit()
    log.info("Ingested %s %s %s: %d drivers, %d laps", year, event.name, rs.code, len(drivers), len(laps))
    if rs.code == "R":
        ingest_standings(db, rs)
    return rs


def ingest_standings(db: Session, rs: RaceSession) -> int:
    """Store the official drivers' and constructors' tables as they stood after this race."""
    drivers = get("championship_drivers", session_key=rs.external_key)
    teams = get("championship_teams", session_key=rs.external_key)
    db.execute(delete(Standing).where(Standing.session_id == rs.id))
    for kind, rows, key in (("driver", drivers, "driver_number"), ("team", teams, "team_name")):
        for row in rows:
            if row.get(key) is None:
                continue
            db.add(Standing(
                session_id=rs.id, kind=kind, entry=str(row[key]),
                position=row.get("position_current"), points=float(row.get("points_current") or 0),
            ))
    db.commit()
    log.info("Standings after %s %s: %d drivers, %d teams", rs.event.year, rs.event.name, len(drivers), len(teams))
    return len(drivers) + len(teams)


def _ms(seconds: float | None) -> int | None:
    return int(round(seconds * 1000)) if seconds else None


def build_lap_telemetry(car: list[dict], location: list[dict], lap_start: datetime, lap_seconds: float) -> dict[str, list]:
    """Turn raw OpenF1 car_data and location samples into the telemetry dict used by analysis.

    OpenF1 has no distance channel, so distance is integrated from speed.
    """
    car = sorted(car, key=lambda c: c["date"])
    t = np.array([(parse_time(c["date"]) - lap_start).total_seconds() for c in car])
    keep = (t >= 0) & (t <= lap_seconds)
    if keep.sum() < 20:
        raise ValueError("Not enough car telemetry for this lap")
    # Pin the trace to the official lap start and end, so the integrated
    # distance covers the whole lap and the time channel ends at the lap time.
    idx = np.flatnonzero(keep)
    idx = np.concatenate([[idx[0]], idx, [idx[-1]]])
    t = np.concatenate([[0.0], t[keep], [lap_seconds]])
    pick = lambda key: np.array([float(c[key] or 0) for c in car])[idx]  # noqa: E731
    speed = pick("speed")

    v = speed / 3.6
    distance = np.concatenate([[0.0], np.cumsum((v[1:] + v[:-1]) / 2 * np.diff(t))])

    loc = sorted(location, key=lambda p: p["date"])
    lt = np.array([(parse_time(p["date"]) - lap_start).total_seconds() for p in loc])
    x = np.interp(t, lt, [p["x"] for p in loc]) if len(loc) else np.zeros_like(t)
    y = np.interp(t, lt, [p["y"] for p in loc]) if len(loc) else np.zeros_like(t)

    return {
        "distance": np.round(distance, 1).tolist(),
        "time": np.round(t, 3).tolist(),
        "speed": speed.tolist(),
        "throttle": np.clip(pick("throttle"), 0, 100).tolist(),
        "brake": (pick("brake") > 0).astype(int).tolist(),
        "gear": pick("n_gear").astype(int).tolist(),
        "x": np.round(x, 0).tolist(),
        "y": np.round(y, 0).tolist(),
    }


def lap_telemetry(session_key: int, driver_number: str, lap_start: datetime, lap_seconds: float) -> dict[str, list]:
    window = (
        f"date>={(lap_start - timedelta(seconds=1)).isoformat()}",
        f"date<={(lap_start + timedelta(seconds=lap_seconds + 1)).isoformat()}",
    )
    car = get("car_data", *window, session_key=session_key, driver_number=driver_number)
    location = get("location", *window, session_key=session_key, driver_number=driver_number)
    return build_lap_telemetry(car, location, lap_start, lap_seconds)
