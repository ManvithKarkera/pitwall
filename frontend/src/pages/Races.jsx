import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate } from "../api.js";

const SESSION_ORDER = { SQ: 0, S: 1, Q: 2, R: 3 };

export default function Races() {
  const [seasons, setSeasons] = useState(null);
  const [year, setYear] = useState(null);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/seasons")
      .then((s) => {
        setSeasons(s);
        setYear(s[0] ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (year == null) return;
    setEvents(null);
    api(`/events?year=${year}`).then(setEvents).catch((e) => setError(e.message));
  }, [year]);

  return (
    <>
      <section className="hero">
        <h1>Where was the time won?</h1>
        <p className="lede">
          Pick a session, choose two drivers, and PitWall overlays their laps — speed, throttle, braking, gears and the
          running gap — on a track map of who was faster where.
        </p>
      </section>

      {error && <p className="error">{error}</p>}
      {seasons && seasons.length === 0 && (
        <p className="empty">No races loaded yet. New sessions are added automatically after each race weekend.</p>
      )}

      {seasons && seasons.length > 0 && (
        <div className="tabs" role="tablist">
          {seasons.map((s) => (
            <button key={s} role="tab" aria-selected={s === year} className={s === year ? "tab active" : "tab"} onClick={() => setYear(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {year != null && !events && !error && <p className="muted">Loading races…</p>}
      {events && (
        <ul className="event-list">
          {events.map((ev) => (
            <li key={ev.id} className="event">
              <div className="event-round">R{String(ev.round).padStart(2, "0")}</div>
              <div className="event-body">
                <h2>{ev.name}</h2>
                <p className="muted">
                  {ev.location}, {ev.country} · {fmtDate(ev.event_date)}
                </p>
              </div>
              <div className="event-sessions">
                {[...ev.sessions]
                  .sort((a, b) => (SESSION_ORDER[a.code] ?? 9) - (SESSION_ORDER[b.code] ?? 9))
                  .map((s) => (
                    <Link key={s.id} to={`/sessions/${s.id}`} className="chip">
                      {s.name}
                    </Link>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
