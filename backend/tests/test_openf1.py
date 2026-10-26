from datetime import datetime, timedelta, timezone

import pytest

from pitwall.worker.openf1 import build_lap_telemetry, tyre_on_lap

START = datetime(2024, 8, 31, 15, 0, tzinfo=timezone.utc)


def samples(seconds, hz, make):
    n = int(seconds * hz)
    return [make(i / hz, (START + timedelta(seconds=i / hz)).isoformat()) for i in range(-hz, n + hz)]


def test_distance_is_integrated_from_speed_and_trimmed_to_lap():
    # 80 s at a constant 180 km/h (50 m/s) => 4000 m
    car = samples(80, 4, lambda t, d: {"date": d, "speed": 180, "throttle": 100, "brake": 0, "n_gear": 7})
    loc = samples(80, 4, lambda t, d: {"date": d, "x": t * 10, "y": -t * 10})
    tel = build_lap_telemetry(car, loc, START, 80.0)

    assert tel["time"][0] == 0 and tel["time"][-1] == 80
    assert tel["distance"][-1] == pytest.approx(4000, rel=0.01)
    assert set(tel["gear"]) == {7} and set(tel["brake"]) == {0}
    assert tel["x"][10] == pytest.approx(tel["time"][10] * 10, abs=1)
    assert len({len(v) for v in tel.values()}) == 1


def test_brake_is_normalised_to_zero_or_one():
    car = samples(30, 4, lambda t, d: {"date": d, "speed": 100, "throttle": 0, "brake": 100, "n_gear": 3})
    tel = build_lap_telemetry(car, [], START, 30.0)
    assert set(tel["brake"]) == {1}


def test_too_little_data_is_rejected():
    car = samples(2, 4, lambda t, d: {"date": d, "speed": 100, "throttle": 0, "brake": 0, "n_gear": 3})
    with pytest.raises(ValueError):
        build_lap_telemetry(car, [], START, 2.0)


def test_tyre_lookup_skips_stints_without_lap_start():
    stints = [
        {"driver_number": 4, "lap_start": None, "lap_end": None, "compound": "SOFT"},
        {"driver_number": 4, "lap_start": 1, "lap_end": 10, "compound": "MEDIUM", "tyre_age_at_start": 2},
        {"driver_number": 16, "lap_start": 1, "lap_end": None, "compound": "HARD"},
    ]
    assert tyre_on_lap(stints, 4, 5) == ("MEDIUM", 6)
    assert tyre_on_lap(stints, 16, 30) == ("HARD", 29)
    assert tyre_on_lap(stints, 4, 11) == ("", None)
