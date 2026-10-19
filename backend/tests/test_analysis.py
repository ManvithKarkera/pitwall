import numpy as np
import pytest

from pitwall.worker.analysis import compare_laps


def synthetic_lap(length=5000.0, n=800, base_speed=200.0, slow_zone=None, slow_factor=1.0):
    """A lap on a circular track at constant speed, optionally slower in one zone."""
    distance = np.linspace(0, length, n)
    speed = np.full(n, base_speed)
    if slow_zone:
        lo, hi = slow_zone
        speed[(distance >= lo) & (distance < hi)] *= slow_factor
    # time = integral of ds / v  (v in m/s)
    v_ms = speed / 3.6
    dt = np.diff(distance) / v_ms[1:]
    time = np.concatenate([[0.0], np.cumsum(dt)])
    angle = distance / length * 2 * np.pi
    return {
        "distance": distance.tolist(),
        "time": time.tolist(),
        "speed": speed.tolist(),
        "throttle": np.where(speed >= base_speed, 100, 40).tolist(),
        "brake": np.where(speed < base_speed, 1, 0).tolist(),
        "gear": np.where(speed >= base_speed, 8, 4).tolist(),
        "x": (np.cos(angle) * 800).tolist(),
        "y": (np.sin(angle) * 800).tolist(),
    }


def test_identical_laps_have_zero_delta():
    lap = synthetic_lap()
    result = compare_laps(lap, lap)
    assert result["final_delta_s"] == pytest.approx(0.0, abs=1e-3)
    assert max(abs(d) for d in result["delta"]) < 1e-3


def test_slower_driver_b_loses_time_only_in_slow_zone():
    a = synthetic_lap()
    b = synthetic_lap(slow_zone=(2000, 2400), slow_factor=0.5)
    result = compare_laps(a, b, n_minisectors=25)

    # 400 m at 100 km/h instead of 200 km/h costs 7.2 s
    assert result["final_delta_s"] == pytest.approx(7.2, abs=0.1)
    assert result["a"]["stats"]["lap_time_s"] < result["b"]["stats"]["lap_time_s"]

    zone = [m for m in result["minisectors"] if 2000 <= m["start_m"] < 2400]
    assert all(m["faster"] == "A" for m in zone)
    assert 2000 <= result["biggest_gap_minisector"]["start_m"] < 2400
    assert result["a"]["stats"]["minisectors_won"] + result["b"]["stats"]["minisectors_won"] == 25


def test_output_arrays_are_aligned_and_json_friendly():
    result = compare_laps(synthetic_lap(), synthetic_lap(length=4990), n_points=300)
    n = len(result["distance"])
    assert n == 300
    for side in ("a", "b"):
        for key in ("speed", "throttle", "brake", "gear"):
            assert len(result[side][key]) == n
    assert len(result["delta"]) == len(result["track"]["x"]) == len(result["track"]["minisector"]) == n
    # both laps scaled to their mean length
    assert result["lap_length_m"] == pytest.approx(4995, abs=0.5)
    assert all(isinstance(v, int) for v in result["a"]["gear"])


def test_unsorted_and_duplicate_samples_are_handled():
    lap = synthetic_lap(n=200)
    shuffled = {k: list(v) for k, v in lap.items()}
    for k in shuffled:
        shuffled[k] = shuffled[k][::-1] + [shuffled[k][-1]]  # reversed + one duplicate
    result = compare_laps(lap, shuffled)
    assert result["final_delta_s"] == pytest.approx(0.0, abs=1e-3)
