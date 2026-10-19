"""Pure lap-comparison maths. No AWS, no database, no network, so it is easy to test.

A lap's telemetry is a dict of equal-length lists:
    distance (m), time (s from lap start), speed (km/h), throttle (0-100),
    brake (0/1), gear, x, y
"""

from typing import Any

import numpy as np

TELEMETRY_KEYS = ("distance", "time", "speed", "throttle", "brake", "gear", "x", "y")


def _clean(tel: dict[str, list[float]]) -> dict[str, np.ndarray]:
    """Sort by distance and drop repeated distance samples so np.interp is valid."""
    arrays = {k: np.asarray(tel[k], dtype=float) for k in TELEMETRY_KEYS}
    order = np.argsort(arrays["distance"], kind="stable")
    arrays = {k: v[order] for k, v in arrays.items()}
    _, first = np.unique(arrays["distance"], return_index=True)
    arrays = {k: v[first] for k, v in arrays.items()}
    arrays["time"] = arrays["time"] - arrays["time"][0]
    return arrays


def _resample(tel: dict[str, np.ndarray], grid: np.ndarray) -> dict[str, np.ndarray]:
    d = tel["distance"]
    out = {k: np.interp(grid, d, tel[k]) for k in ("time", "speed", "throttle", "x", "y")}
    out["brake"] = np.interp(grid, d, tel["brake"]) >= 0.5
    out["gear"] = np.rint(np.interp(grid, d, tel["gear"])).astype(int)
    return out


def _r(values: np.ndarray, digits: int) -> list:
    return [round(float(v), digits) for v in values]


def compare_laps(
    tel_a: dict[str, list[float]],
    tel_b: dict[str, list[float]],
    n_points: int = 600,
    n_minisectors: int = 25,
) -> dict[str, Any]:
    a, b = _clean(tel_a), _clean(tel_b)
    # Each lap's distance channel is measured (or integrated) separately and can
    # disagree by a percent or so. Scale both to their mean so that the same
    # distance means the same place on track and both laps finish together.
    length = float((a["distance"][-1] + b["distance"][-1]) / 2)
    for lap in (a, b):
        lap["distance"] = lap["distance"] * (length / lap["distance"][-1])
    grid = np.linspace(0.0, length, n_points)
    ra, rb = _resample(a, grid), _resample(b, grid)

    # Positive delta means B is behind A at that point of the lap.
    delta = rb["time"] - ra["time"]

    edges = np.linspace(0.0, length, n_minisectors + 1)
    ta, tb = np.interp(edges, a["distance"], a["time"]), np.interp(edges, b["distance"], b["time"])
    seg_a, seg_b = np.diff(ta), np.diff(tb)
    minisectors = [
        {
            "index": i,
            "start_m": round(float(edges[i]), 1),
            "end_m": round(float(edges[i + 1]), 1),
            "faster": "A" if seg_a[i] <= seg_b[i] else "B",
            "gain_s": round(float(abs(seg_a[i] - seg_b[i])), 3),
        }
        for i in range(n_minisectors)
    ]
    ms_index = np.minimum((grid / length * n_minisectors).astype(int), n_minisectors - 1)

    def stats(r: dict[str, np.ndarray], raw: dict[str, np.ndarray]) -> dict[str, float]:
        return {
            "lap_time_s": round(float(raw["time"][-1]), 3),
            "top_speed": round(float(raw["speed"].max()), 1),
            "avg_speed": round(float(r["speed"].mean()), 1),
            "full_throttle_pct": round(float((r["throttle"] >= 98).mean() * 100), 1),
            "braking_pct": round(float(r["brake"].mean() * 100), 1),
            "minisectors_won": 0,
        }

    sa, sb = stats(ra, a), stats(rb, b)
    sa["minisectors_won"] = sum(m["faster"] == "A" for m in minisectors)
    sb["minisectors_won"] = n_minisectors - sa["minisectors_won"]

    biggest = max(minisectors, key=lambda m: m["gain_s"])

    return {
        "lap_length_m": round(length, 1),
        "distance": _r(grid, 1),
        "a": {
            "speed": _r(ra["speed"], 1),
            "throttle": _r(ra["throttle"], 0),
            "brake": [int(v) for v in ra["brake"]],
            "gear": [int(v) for v in ra["gear"]],
            "stats": sa,
        },
        "b": {
            "speed": _r(rb["speed"], 1),
            "throttle": _r(rb["throttle"], 0),
            "brake": [int(v) for v in rb["brake"]],
            "gear": [int(v) for v in rb["gear"]],
            "stats": sb,
        },
        "delta": _r(delta, 3),
        "final_delta_s": round(float(delta[-1]), 3),
        "track": {"x": _r(ra["x"], 0), "y": _r(ra["y"], 0), "minisector": [int(v) for v in ms_index]},
        "minisectors": minisectors,
        "biggest_gap_minisector": biggest,
    }
