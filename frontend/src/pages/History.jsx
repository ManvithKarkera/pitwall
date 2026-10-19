import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, fmtDate } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function History() {
  const { user, ready } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) api("/comparisons").then(setItems).catch((e) => setError(e.message));
  }, [user]);

  if (ready && !user) return <Navigate to="/login?next=/history" replace />;

  return (
    <>
      <header className="page-head">
        <h1>My comparisons</h1>
      </header>
      {error && <p className="error">{error}</p>}
      {items && items.length === 0 && (
        <p className="empty">
          Nothing here yet. <Link to="/">Pick a session</Link> and compare two laps.
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="history">
          {items.map((c) => (
            <li key={c.id}>
              <Link to={`/comparisons/${c.id}`}>
                <strong>{c.driver_a} <span className="muted">L{c.lap_a}</span> vs {c.driver_b} <span className="muted">L{c.lap_b}</span></strong>
                <span className="muted">{c.year} {c.event_name} · {c.session_name}</span>
                <span className={`status status-${c.status}`}>{c.status}</span>
                <span className="muted hide-sm">{fmtDate(c.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
