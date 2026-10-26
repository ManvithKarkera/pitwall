import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fmtLap } from "../api.js";
import Plot, { baseLayout, plotConfig } from "../components/Plot.jsx";

const POLL_MS = 2000;

function useComparison(id) {
  const [comparison, setComparison] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let timer;
    let cancelled = false;
    async function poll() {
      try {
        const c = await api(`/comparisons/${id}`);
        if (cancelled) return;
        setComparison(c);
        if (c.status === "done") {
          const res = await fetch(c.data_url);
          if (!res.ok) throw new Error("Could not load the comparison data");
          const json = await res.json();
          if (!cancelled) setData(json);
        } else if (c.status !== "failed") {
          timer = setTimeout(poll, POLL_MS);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  return { comparison, data, error };
}

function TrackMap({ data }) {
  const { meta, track, minisectors } = data;
  const traces = useMemo(() => {
    const faster = Object.fromEntries(minisectors.map((m) => [m.index, m.faster]));
    const runs = [];
    let current = null;
    track.x.forEach((x, i) => {
      const who = faster[track.minisector[i]];
      if (!current || current.who !== who) {
        if (current) {
          current.x.push(x);
          current.y.push(track.y[i]);
        }
        current = { who, x: [], y: [] };
        runs.push(current);
      }
      current.x.push(x);
      current.y.push(track.y[i]);
    });
    return runs.map((r) => ({
      type: "scatter",
      mode: "lines",
      x: r.x,
      y: r.y,
      line: { color: r.who === "A" ? meta.color_a : meta.color_b, width: 7 },
      hoverinfo: "skip",
    }));
  }, [data]);

  return (
    <Plot
      data={traces}
      layout={baseLayout({
        margin: { l: 8, r: 8, t: 8, b: 8 },
        xaxis: { visible: false },
        yaxis: { visible: false, scaleanchor: "x" },
        height: 380,
      })}
      config={{ ...plotConfig, staticPlot: true }}
    />
  );
}

function TelemetryStack({ data }) {
  const { meta, distance: d, a, b, delta } = data;
  const line = (color, width = 1.6) => ({ color, width });
  const hv = (unit) => `%{y}${unit}<extra>%{fullData.name}</extra>`;
  const traces = [
    { y: a.speed, name: meta.driver_a, yaxis: "y", line: line(meta.color_a), hovertemplate: hv(" km/h") },
    { y: b.speed, name: meta.driver_b, yaxis: "y", line: line(meta.color_b), hovertemplate: hv(" km/h") },
    { y: delta, name: "Gap", yaxis: "y2", line: line("#241914", 1.4), fill: "tozeroy", fillcolor: "rgba(36,25,20,0.07)", hovertemplate: `%{y:+.3f}s<extra>gap</extra>` },
    { y: a.throttle, name: meta.driver_a, yaxis: "y3", line: line(meta.color_a, 1.2), hovertemplate: hv("%") },
    { y: b.throttle, name: meta.driver_b, yaxis: "y3", line: line(meta.color_b, 1.2), hovertemplate: hv("%") },
    { y: a.brake, name: meta.driver_a, yaxis: "y4", line: { ...line(meta.color_a, 1.2), shape: "hv" }, hovertemplate: hv("") },
    { y: b.brake.map((v) => v * 0.85), name: meta.driver_b, yaxis: "y4", line: { ...line(meta.color_b, 1.2), shape: "hv" }, hoverinfo: "skip" },
    { y: a.gear, name: meta.driver_a, yaxis: "y5", line: { ...line(meta.color_a, 1.2), shape: "hv" }, hovertemplate: hv("") },
    { y: b.gear, name: meta.driver_b, yaxis: "y5", line: { ...line(meta.color_b, 1.2), shape: "hv" }, hovertemplate: hv("") },
  ].map((t) => ({ type: "scatter", mode: "lines", x: d, ...t }));

  const axis = (title, domain, extra = {}) => ({
    title: { text: title, font: { size: 11 } },
    domain,
    gridcolor: "rgba(36,25,20,0.08)",
    zeroline: false,
    ...extra,
  });

  return (
    <Plot
      data={traces}
      layout={baseLayout({
        height: 720,
        hovermode: "x unified",
        xaxis: { title: { text: "Distance (m)" }, gridcolor: "rgba(36,25,20,0.08)", zeroline: false, ticksuffix: " m", anchor: "y5" },
        yaxis: axis("Speed", [0.56, 1]),
        yaxis2: axis(`Gap (s) · + = ${meta.driver_a} ahead`, [0.38, 0.53], { zeroline: true, zerolinecolor: "rgba(36,25,20,0.3)" }),
        yaxis3: axis("Throttle", [0.22, 0.35], { range: [-5, 105] }),
        yaxis4: axis("Brake", [0.14, 0.2], { showticklabels: false, range: [-0.1, 1.1] }),
        yaxis5: axis("Gear", [0, 0.12], { dtick: 2 }),
      })}
      config={plotConfig}
    />
  );
}

function StatCard({ side, data }) {
  const { meta } = data;
  const s = data[side].stats;
  const key = side === "a" ? "a" : "b";
  const info = meta[`lap_${key}_info`] ?? {};
  return (
    <div className="stat-card" style={{ "--team": meta[`color_${key}`] }}>
      <p className="eyebrow">{meta[`team_${key}`]}</p>
      <h3>{meta[`name_${key}`]}</h3>
      <p className="lap-time">{fmtLap(info.lap_time_s ? info.lap_time_s * 1000 : s.lap_time_s * 1000)}</p>
      <dl>
        <div><dt>Lap</dt><dd>{meta[`lap_${key}`]}{info.compound ? ` · ${info.compound.toLowerCase()}` : ""}</dd></div>
        <div><dt>Top speed</dt><dd>{s.top_speed} km/h</dd></div>
        <div><dt>Full throttle</dt><dd>{s.full_throttle_pct}%</dd></div>
        <div><dt>Mini-sectors</dt><dd>{s.minisectors_won} / {data.minisectors.length}</dd></div>
      </dl>
    </div>
  );
}

export default function ComparisonPage() {
  const { id } = useParams();
  const { comparison: c, data, error } = useComparison(id);
  const [copied, setCopied] = useState(false);

  if (error) return <p className="error">{error}</p>;
  if (!c) return <p className="muted">Loading…</p>;

  const title = `${c.driver_a} vs ${c.driver_b}`;
  const head = (
    <header className="page-head">
      <Link to={`/sessions/${c.session_id}`} className="back">← {c.event_name}</Link>
      <p className="eyebrow">{c.year} · {c.event_name} · {c.session_name}</p>
      <h1>{title}</h1>
    </header>
  );

  if (c.status === "failed") {
    return <>{head}<p className="error">{c.error || "The analysis failed."}</p></>;
  }
  if (c.status !== "done" || !data) {
    return (
      <>
        {head}
        <div className="processing" role="status">
          <span className="pulse" aria-hidden />
          <div>
            <strong>{c.status === "processing" ? "Crunching telemetry…" : "Queued"}</strong>
            <p className="muted">
              Lap {c.lap_a} vs lap {c.lap_b}. This usually takes under half a minute. You'll also get an email when it's ready.
            </p>
          </div>
        </div>
      </>
    );
  }

  const { meta } = data;
  const gap = data.final_delta_s;
  const leader = gap >= 0 ? meta.driver_a : meta.driver_b;
  const leaderColor = gap >= 0 ? meta.color_a : meta.color_b;
  const big = data.biggest_gap_minisector;

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the URL bar still works */
    }
  }

  return (
    <>
      {head}
      <p className="verdict">
        <strong style={{ color: leaderColor }}>{leader}</strong> was{" "}
        <strong className="mono">{Math.abs(gap).toFixed(3)}s</strong> quicker. The biggest swing:{" "}
        <span className="mono">{big.gain_s.toFixed(3)}s</span> to {big.faster === "A" ? meta.driver_a : meta.driver_b} between{" "}
        {Math.round(big.start_m)} m and {Math.round(big.end_m)} m.
      </p>
      <div className="actions">
        <a className="primary" href={c.report_url} target="_blank" rel="noreferrer">Download PDF report</a>
        <button className="ghost" onClick={share}>{copied ? "Link copied" : "Copy share link"}</button>
      </div>

      <div className="compare-grid">
        <StatCard side="a" data={data} />
        <section className="panel track">
          <h2 className="section-title">Who was faster where</h2>
          <TrackMap data={data} />
          <p className="legend">
            <span style={{ "--c": meta.color_a }}>{meta.driver_a}</span>
            <span style={{ "--c": meta.color_b }}>{meta.driver_b}</span>
          </p>
        </section>
        <StatCard side="b" data={data} />
      </div>

      <section className="panel">
        <h2 className="section-title">Telemetry</h2>
        <TelemetryStack data={data} />
      </section>
    </>
  );
}
