"""Championship standings: the official tables after each race, with wins, podiums and progression."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Event, RaceSession, SessionResult, Standing

router = APIRouter(prefix="/api/standings", tags=["standings"])


def _races(db: Session, year: int) -> list[RaceSession]:
    """The year's races that have standings stored, in round order."""
    stmt = (
        select(RaceSession).join(Event)
        .where(Event.year == year, RaceSession.code == "R", RaceSession.id.in_(select(Standing.session_id)))
        .order_by(Event.round)
    )
    return list(db.scalars(stmt))


def _table(db: Session, year: int, kind: str):
    races = _races(db, year)
    if not races:
        raise HTTPException(404, f"No standings stored for {year}")
    ids = [r.id for r in races]
    rows = db.scalars(select(Standing).where(Standing.session_id.in_(ids), Standing.kind == kind)).all()
    by_entry: dict[str, dict[int, Standing]] = {}
    for s in rows:
        by_entry.setdefault(s.entry, {})[s.session_id] = s
    results = db.scalars(select(SessionResult).where(SessionResult.session_id.in_(ids))).all()
    rounds = [{"round": r.event.round, "name": r.event.name, "country": r.event.country} for r in races]
    latest = races[-1].id
    return races, by_entry, results, rounds, latest


def _progression(races, history: dict[int, Standing]) -> list[float | None]:
    out, last = [], None
    for r in races:
        if r.id in history:
            last = history[r.id].points
        out.append(last)
    return out


def _finish(rows: list[dict]) -> list[dict]:
    rows.sort(key=lambda r: (r["position"] is None, r["position"] or 0, -r["points"]))
    leader = rows[0]["points"] if rows else 0
    for r in rows:
        r["gap"] = round(leader - r["points"], 1)
    return rows


@router.get("/seasons", response_model=list[int])
def seasons(db: Session = Depends(get_db)):
    stmt = select(Event.year).join(RaceSession).where(RaceSession.id.in_(select(Standing.session_id))).distinct()
    return sorted(db.scalars(stmt), reverse=True)


@router.get("/drivers")
def drivers(year: int, db: Session = Depends(get_db)):
    races, by_entry, results, rounds, latest = _table(db, year, "driver")
    # Who a car number belongs to: their most recent race result this season.
    order = {r.id: i for i, r in enumerate(races)}
    who: dict[str, SessionResult] = {}
    for res in sorted(results, key=lambda x: order[x.session_id]):
        who[res.driver_number] = res
    rows = []
    for number, history in by_entry.items():
        now = history.get(latest) or history[max(history, key=lambda sid: order[sid])]
        res = who.get(number)
        finishes = [x.position for x in results if x.driver_number == number]
        rows.append({
            "position": now.position, "points": now.points, "number": number,
            "driver_code": res.driver_code if res else number, "full_name": res.full_name if res else f"Car {number}",
            "team": res.team if res else "", "team_color": res.team_color if res else "#888888",
            "headshot_url": res.headshot_url if res else None,
            "wins": sum(1 for p in finishes if p == 1), "podiums": sum(1 for p in finishes if p and p <= 3),
            "progression": _progression(races, history),
        })
    return {"year": year, "kind": "drivers", "rounds": rounds, "rows": _finish(rows)}


@router.get("/constructors")
def constructors(year: int, db: Session = Depends(get_db)):
    races, by_entry, results, rounds, latest = _table(db, year, "team")
    order = {r.id: i for i, r in enumerate(races)}
    rows = []
    for team, history in by_entry.items():
        now = history.get(latest) or history[max(history, key=lambda sid: order[sid])]
        mine = [x for x in results if x.team == team]
        recent = max(mine, key=lambda x: order[x.session_id], default=None)
        drivers_now = sorted({x.driver_code for x in mine if recent and x.session_id == recent.session_id})
        rows.append({
            "position": now.position, "points": now.points, "team": team,
            "team_color": recent.team_color if recent else "#888888", "drivers": drivers_now,
            "wins": sum(1 for x in mine if x.position == 1), "podiums": sum(1 for x in mine if x.position and x.position <= 3),
            "progression": _progression(races, history),
        })
    return {"year": year, "kind": "constructors", "rounds": rounds, "rows": _finish(rows)}
