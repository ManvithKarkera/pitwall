"""Queue ingestion jobs for finished sessions of a season.

    python -m pitwall.seed --year 2024                          # every Q and R of 2024
    python -m pitwall.seed --year 2024 --location Monza --codes Q,R,S,SQ
    python -m pitwall.seed --year 2024 --location Monza --direct  # ingest now, without SQS
    python -m pitwall.seed --year 2024 --standings              # refresh championship tables for stored races
"""

import argparse

from sqlalchemy import select

from . import aws
from .db import get_sessionmaker, init_db
from .logging_setup import setup_logging
from .models import Event, RaceSession
from .worker import openf1


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--year", type=int, required=True)
    p.add_argument("--location", help="only this circuit location, e.g. Monza")
    p.add_argument("--codes", default="Q,R", help="session codes: Q,R,S,SQ")
    p.add_argument("--direct", action="store_true", help="ingest in this process instead of queueing")
    p.add_argument("--standings", action="store_true", help="only refresh championship tables for the year's stored races")
    args = p.parse_args()

    setup_logging("seed")
    if args.standings:
        init_db()
        with get_sessionmaker()() as db:
            keys = list(db.scalars(
                select(RaceSession.external_key).join(Event).where(Event.year == args.year, RaceSession.code == "R")
            ))
        for key in keys:
            aws.send_job({"type": "standings", "session_key": key})
        print(f"Queued standings for {len(keys)} races")
        return
    sessions = [
        s for s in openf1.finished_sessions(args.year, set(args.codes.upper().split(",")))
        if not args.location or s["location"].lower() == args.location.lower()
    ]
    if args.direct:
        init_db()
        with get_sessionmaker()() as db:
            for s in sessions:
                openf1.ingest_session(db, s["session_key"])
    else:
        for s in sessions:
            aws.send_job({"type": "ingest_session", "session_key": s["session_key"]})
    print(f"{'Ingested' if args.direct else 'Queued'} {len(sessions)} sessions")


if __name__ == "__main__":
    main()
