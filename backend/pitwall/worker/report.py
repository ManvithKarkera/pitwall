"""Chart images (Matplotlib) and the downloadable PDF report (ReportLab)."""

import io
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.collections import LineCollection  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.styles import getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle  # noqa: E402

INK = "#15171c"
GRID = "#d9dce3"


def _fmt_lap(seconds: float | None) -> str:
    if seconds is None:
        return "-"
    m, s = divmod(seconds, 60)
    return f"{int(m)}:{s:06.3f}"


def _png(fig) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return buf.getvalue()


def telemetry_chart(result: dict[str, Any], meta: dict[str, Any]) -> bytes:
    d = result["distance"]
    a, b = result["a"], result["b"]
    ca, cb = meta["color_a"], meta["color_b"]
    la, lb = meta["driver_a"], meta["driver_b"]

    fig, axes = plt.subplots(
        5, 1, figsize=(11, 10), sharex=True,
        gridspec_kw={"height_ratios": [3, 1.4, 1.2, 0.6, 1.2], "hspace": 0.08},
    )
    speed, delta, throttle, brake, gear = axes

    speed.plot(d, a["speed"], color=ca, lw=1.4, label=la)
    speed.plot(d, b["speed"], color=cb, lw=1.4, label=lb)
    speed.set_ylabel("Speed (km/h)")
    speed.legend(loc="lower right", frameon=False)

    delta.axhline(0, color=GRID, lw=1)
    delta.plot(d, result["delta"], color=INK, lw=1.2)
    delta.set_ylabel(f"Gap (s)\n+ = {la} ahead", fontsize=8)

    throttle.plot(d, a["throttle"], color=ca, lw=1)
    throttle.plot(d, b["throttle"], color=cb, lw=1)
    throttle.set_ylabel("Throttle %")

    brake.step(d, a["brake"], color=ca, lw=1, where="mid")
    brake.step(d, [v * 0.9 for v in b["brake"]], color=cb, lw=1, where="mid")
    brake.set_ylabel("Brake")
    brake.set_yticks([])

    gear.step(d, a["gear"], color=ca, lw=1, where="mid")
    gear.step(d, b["gear"], color=cb, lw=1, where="mid")
    gear.set_ylabel("Gear")
    gear.set_xlabel("Distance (m)")

    for ax in axes:
        ax.grid(color=GRID, lw=0.5)
        ax.spines[["top", "right"]].set_visible(False)
    return _png(fig)


def track_map(result: dict[str, Any], meta: dict[str, Any]) -> bytes:
    t = result["track"]
    faster = {m["index"]: m["faster"] for m in result["minisectors"]}
    points = list(zip(t["x"], t["y"]))
    segments = [[points[i], points[i + 1]] for i in range(len(points) - 1)]
    seg_colors = [meta["color_a"] if faster[t["minisector"][i]] == "A" else meta["color_b"] for i in range(len(segments))]

    fig, ax = plt.subplots(figsize=(6, 6))
    ax.add_collection(LineCollection(segments, colors=seg_colors, linewidths=5, capstyle="round"))
    ax.autoscale()
    ax.set_aspect("equal")
    ax.axis("off")
    ax.plot([], [], color=meta["color_a"], lw=5, label=f"{meta['driver_a']} faster")
    ax.plot([], [], color=meta["color_b"], lw=5, label=f"{meta['driver_b']} faster")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, 0), ncol=2, frameon=False)
    return _png(fig)


def pdf_report(result: dict[str, Any], meta: dict[str, Any], chart_png: bytes, track_png: bytes) -> bytes:
    styles = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=15 * mm)
    la, lb = meta["driver_a"], meta["driver_b"]
    sa, sb = result["a"]["stats"], result["b"]["stats"]

    def sector(side: str, n: int) -> str:
        v = meta[f"lap_{side}_info"].get(f"sector{n}_ms")
        return f"{v / 1000:.3f}" if v else "-"

    rows = [
        ["", f"{la} lap {meta['lap_a']}", f"{lb} lap {meta['lap_b']}"],
        ["Lap time", _fmt_lap(meta["lap_a_info"].get("lap_time_s") or sa["lap_time_s"]), _fmt_lap(meta["lap_b_info"].get("lap_time_s") or sb["lap_time_s"])],
        ["Sector 1", sector("a", 1), sector("b", 1)],
        ["Sector 2", sector("a", 2), sector("b", 2)],
        ["Sector 3", sector("a", 3), sector("b", 3)],
        ["Tyre", meta["lap_a_info"].get("compound") or "-", meta["lap_b_info"].get("compound") or "-"],
        ["Top speed (km/h)", sa["top_speed"], sb["top_speed"]],
        ["Average speed (km/h)", sa["avg_speed"], sb["avg_speed"]],
        ["Full throttle", f"{sa['full_throttle_pct']}%", f"{sb['full_throttle_pct']}%"],
        ["Braking", f"{sa['braking_pct']}%", f"{sb['braking_pct']}%"],
        ["Mini-sectors won", sa["minisectors_won"], sb["minisectors_won"]],
    ]
    table = Table(rows, colWidths=[55 * mm, 55 * mm, 55 * mm])
    table.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("TEXTCOLOR", (1, 0), (1, 0), colors.HexColor(meta["color_a"])),
        ("TEXTCOLOR", (2, 0), (2, 0), colors.HexColor(meta["color_b"])),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor(INK)),
        ("LINEBELOW", (0, 1), (-1, -1), 0.3, colors.HexColor(GRID)),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    gap = result["final_delta_s"]
    leader, trailer = (la, lb) if gap >= 0 else (lb, la)
    big = result["biggest_gap_minisector"]
    big_who = la if big["faster"] == "A" else lb
    summary = (
        f"<b>{leader}</b> finishes the compared distance <b>{abs(gap):.3f}s</b> ahead of {trailer}. "
        f"The biggest single swing is {big['gain_s']:.3f}s to <b>{big_who}</b> between "
        f"{big['start_m']:.0f} m and {big['end_m']:.0f} m into the lap."
    )

    story = [
        Paragraph(f"{la} vs {lb}", styles["Title"]),
        Paragraph(f"{meta['year']} {meta['event_name']} &middot; {meta['session_name']}", styles["Heading3"]),
        Spacer(1, 4 * mm),
        Paragraph(summary, styles["BodyText"]),
        Spacer(1, 5 * mm),
        table,
        Spacer(1, 6 * mm),
        Image(io.BytesIO(track_png), width=95 * mm, height=95 * mm),
        Image(io.BytesIO(chart_png), width=180 * mm, height=164 * mm),
        Paragraph("Generated by PitWall from OpenF1 public timing data (openf1.org).", styles["Italic"]),
    ]
    doc.build(story)
    return buf.getvalue()
