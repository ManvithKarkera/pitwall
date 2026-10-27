from datetime import date

from pitwall.db import get_sessionmaker
from pitwall.models import Event, RaceSession, SessionResult, Standing
from pitwall.worker import openf1

# Two races of a season: NOR wins round 1, PIA wins round 2 and leads after it.
CHAMPIONSHIP = {
    101: ([("4", 1, 25.0), ("81", 2, 18.0)], [("McLaren", 1, 43.0)]),
    102: ([("81", 1, 43.0), ("4", 2, 43.0)], [("McLaren", 1, 86.0)]),
}


def season():
    with get_sessionmaker()() as db:
        for rnd, key, winner in ((1, 101, "NOR"), (2, 102, "PIA")):
            ev = Event(external_key=key, year=2025, round=rnd, name=f"GP {rnd}", country="X", location="Y", event_date=date(2025, rnd, 1))
            db.add(ev)
            db.flush()
            rs = RaceSession(external_key=key, event_id=ev.id, code="R", name="Race")
            db.add(rs)
            db.flush()
            for code, number in (("NOR", "4"), ("PIA", "81")):
                db.add(SessionResult(session_id=rs.id, driver_code=code, driver_number=number, full_name=code, team="McLaren",
                                     team_color="#ff8000", position=1 if code == winner else 2, status=""))
        db.commit()


def fake_get(endpoint, **params):
    drivers, teams = CHAMPIONSHIP[params["session_key"]]
    if endpoint == "championship_drivers":
        return [{"driver_number": int(n), "position_current": p, "points_current": pts} for n, p, pts in drivers]
    if endpoint == "championship_teams":
        return [{"team_name": t, "position_current": p, "points_current": pts} for t, p, pts in teams]
    raise AssertionError(endpoint)


def test_ingest_standings_replaces_the_table_for_a_race(database, monkeypatch):
    season()
    monkeypatch.setattr(openf1, "get", fake_get)
    with get_sessionmaker()() as db:
        rs = db.query(RaceSession).filter_by(external_key=101).one()
        assert openf1.ingest_standings(db, rs) == 3
        assert openf1.ingest_standings(db, rs) == 3  # re-running doesn't duplicate rows
        assert db.query(Standing).filter_by(session_id=rs.id).count() == 3


def test_standings_api(client, monkeypatch):
    season()
    monkeypatch.setattr(openf1, "get", fake_get)
    with get_sessionmaker()() as db:
        for rs in db.query(RaceSession).all():
            openf1.ingest_standings(db, rs)

    assert client.get("/api/standings/seasons").json() == [2025]
    d = client.get("/api/standings/drivers", params={"year": 2025}).json()
    assert [r["driver_code"] for r in d["rows"]] == ["PIA", "NOR"]
    pia, nor = d["rows"]
    assert (pia["points"], pia["gap"], pia["wins"], pia["podiums"]) == (43.0, 0.0, 1, 2)
    assert nor["progression"] == [25.0, 43.0]
    assert [r["round"] for r in d["rounds"]] == [1, 2]

    c = client.get("/api/standings/constructors", params={"year": 2025}).json()
    assert c["rows"][0]["team"] == "McLaren"
    assert c["rows"][0]["drivers"] == ["NOR", "PIA"]
    assert c["rows"][0]["wins"] == 2
    assert client.get("/api/standings/drivers", params={"year": 1999}).status_code == 404
