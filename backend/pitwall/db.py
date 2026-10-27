from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().sqlalchemy_url, pool_pre_ping=True, pool_size=5)


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def init_db() -> None:
    from . import models  # noqa: F401  (registers tables)

    with get_engine().begin() as conn:
        if conn.dialect.name == "postgresql":  # API and worker start together; let only one create tables
            conn.execute(text("SELECT pg_advisory_xact_lock(7291)"))
        Base.metadata.create_all(conn)
        add_missing_columns(conn)


def add_missing_columns(conn) -> list[str]:
    """create_all makes new tables but never new columns: add any model column the live table lacks.

    New columns are added nullable with no default, so existing rows read as NULL until re-ingested.
    """
    live = inspect(conn)
    added = []
    for table in Base.metadata.sorted_tables:
        if not live.has_table(table.name):
            continue
        have = {c["name"] for c in live.get_columns(table.name)}
        for col in table.columns:
            if col.name not in have:
                conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN {col.name} {col.type.compile(conn.dialect)}'))
                added.append(f"{table.name}.{col.name}")
    return added


def get_db() -> Iterator[Session]:
    db = get_sessionmaker()()
    try:
        yield db
    finally:
        db.close()
