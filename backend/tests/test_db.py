from sqlalchemy import inspect, text


def test_add_missing_columns_adds_new_nullable_columns(database):
    from pitwall.db import add_missing_columns, get_engine

    engine = get_engine()
    with engine.begin() as conn:
        # Simulate a database created before session_results had a headshot column.
        conn.execute(text("ALTER TABLE session_results DROP COLUMN headshot_url"))
    assert "headshot_url" not in {c["name"] for c in inspect(engine).get_columns("session_results")}

    with engine.begin() as conn:
        assert add_missing_columns(conn) == ["session_results.headshot_url"]
    assert "headshot_url" in {c["name"] for c in inspect(engine).get_columns("session_results")}

    with engine.begin() as conn:
        assert add_missing_columns(conn) == []
