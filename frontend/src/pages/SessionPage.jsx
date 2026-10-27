import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fmtDate, fmtLap } from "../api.js";
import { useAuth } from "../auth.jsx";

function LapPicker({ sessionId, label, results, driver, lap, onDriver, onLap }) {
  const [laps, setLaps] = useState([]);
  useEffect(() => {
    setLaps([]);
    if (!driver) return;
    api(`/sessions/${sessionId}/laps?driver=${driver}`).then(setLaps).catch(() => setLaps([]));
  }, [sessionId, driver]);

  const result = results.find((r) => r.driver_code === driver);
  return (
    <div className="picker" style={{ "--team": result?.team_color ?? "var(--line)" }}>
      <span className="picker-label">{label}</span>
      <label>
        Driver
        <select value={driver} onChange={(e) => onDriver(e.target.value)}>
          <option value="">Choose…</option>
          {results.map((r) => (
            <option key={r.driver_code} value={r.driver_code}>
              {r.driver_code} · {r.full_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Lap
        <select value={lap} onChange={(e) => onLap(e.target.value)} disabled={!driver}>
          <option value="">Fastest lap{result?.best_lap_ms ? ` · ${fmtLap(result.best_lap_ms)}` : ""}</option>
          {laps
            .filter((l) => l.lap_time_ms)
            .map((l) => (
              <option key={l.lap_number} value={l.lap_number}>
                Lap {l.lap_number} · {fmtLap(l.lap_time_ms)}
                {l.compound ? ` · ${l.compound.toLowerCase()}` : ""}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}

export default function SessionPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [a, setA] = useState({ driver: "", lap: "" });
  const [b, setB] = useState({ driver: "", lap: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/sessions/${id}`)
      .then((s) => {
        setSession(s);
        const ranked = s.results.filter((r) => r.best_lap_ms);
        if (ranked[0]) setA({ driver: ranked[0].driver_code, lap: "" });
        if (ranked[1]) setB({ driver: ranked[1].driver_code, lap: "" });
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function compare(e) {
    e.preventDefault();
    if (!user) {
      navigate(`/login?next=/sessions/${id}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const c = await api("/comparisons", {
        method: "POST",
        body: {
          session_id: Number(id),
          driver_a: a.driver,
          lap_a: a.lap ? Number(a.lap) : null,
          driver_b: b.driver,
          lap_b: b.lap ? Number(b.lap) : null,
        },
      });
      navigate(`/comparisons/${c.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (error && !session) return <p className="error">{error}</p>;
  if (!session) return <p className="muted">Loading session…</p>;

  const fastest = Math.min(...session.results.filter((r) => r.best_lap_ms).map((r) => r.best_lap_ms));
  const ev = session.event;

  return (
    <>
      <Link to="/races" className="back">← All races</Link>
      <header className="page-head">
        <p className="eyebrow">
          {ev.year} · Round {ev.round} · {fmtDate(session.starts_at ?? ev.event_date)}
        </p>
        <h1>
          {ev.name} <span className="muted">{session.name}</span>
        </h1>
      </header>

      <form className="compare-panel" onSubmit={compare}>
        <LapPicker sessionId={id} label="A" results={session.results} driver={a.driver} lap={a.lap}
          onDriver={(driver) => setA({ driver, lap: "" })} onLap={(lap) => setA({ ...a, lap })} />
        <span className="vs" aria-hidden>vs</span>
        <LapPicker sessionId={id} label="B" results={session.results} driver={b.driver} lap={b.lap}
          onDriver={(driver) => setB({ driver, lap: "" })} onLap={(lap) => setB({ ...b, lap })} />
        <button className="primary" disabled={busy || !a.driver || !b.driver}>
          {busy ? "Queuing…" : user ? "Compare laps" : "Sign in to compare"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>

      <h2 className="section-title">Classification</h2>
      <div className="table-wrap">
        <table className="results">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Driver</th>
              <th className="hide-sm">Team</th>
              <th className="num">Best lap</th>
              <th className="num">Gap</th>
              <th aria-label="Pick for comparison" />
            </tr>
          </thead>
          <tbody>
            {session.results.map((r) => (
              <tr key={r.driver_code}>
                <td className="num">{r.position ?? r.status ?? "–"}</td>
                <td>
                  <span className="team-bar" style={{ background: r.team_color }} />
                  <strong>{r.driver_code}</strong> <span className="muted hide-sm">{r.full_name}</span>
                </td>
                <td className="muted hide-sm">{r.team}</td>
                <td className="num">{fmtLap(r.best_lap_ms)}</td>
                <td className="num muted">
                  {r.best_lap_ms && r.best_lap_ms !== fastest ? `+${((r.best_lap_ms - fastest) / 1000).toFixed(3)}` : ""}
                </td>
                <td className="pick">
                  <button type="button" className={a.driver === r.driver_code ? "mini on" : "mini"} onClick={() => setA({ driver: r.driver_code, lap: "" })}>A</button>
                  <button type="button" className={b.driver === r.driver_code ? "mini on" : "mini"} onClick={() => setB({ driver: r.driver_code, lap: "" })}>B</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
