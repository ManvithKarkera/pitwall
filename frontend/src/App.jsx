import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./auth.jsx";
import Races from "./pages/Races.jsx";
import SessionPage from "./pages/SessionPage.jsx";
import ComparisonPage from "./pages/ComparisonPage.jsx";
import History from "./pages/History.jsx";
import Login from "./pages/Login.jsx";

// The strip under the nav: what is loaded right now, from /api/stats.
function DataStrip() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api("/stats").then(setStats).catch(() => setStats(null));
  }, []);
  if (!stats) return <div className="strip" aria-hidden />;
  return (
    <div className="strip">
      <div className="wrap strip-inner">
        <span className="strip-live" aria-hidden />
        <span><strong>{stats.events}</strong> grands prix</span>
        <span><strong>{stats.sessions}</strong> sessions</span>
        <span><strong>{stats.laps.toLocaleString("en-GB")}</strong> laps timed</span>
      </div>
    </div>
  );
}

export default function App() {
  const { user, signOut } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <div className="wrap topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden />
            PitWall
          </Link>
          <nav>
            <NavLink to="/" end>Races</NavLink>
            {user && <NavLink to="/history">My comparisons</NavLink>}
          </nav>
          <div className="topbar-user">
            {user ? (
              <>
                <span className="user-name">{user.display_name}</span>
                <button className="link" onClick={signOut}>Sign out</button>
              </>
            ) : (
              <NavLink to="/login" className="pill-dark">Sign in</NavLink>
            )}
          </div>
        </div>
        <DataStrip />
      </header>
      <main className="wrap">
        <Routes>
          <Route path="/" element={<Races />} />
          <Route path="/sessions/:id" element={<SessionPage />} />
          <Route path="/comparisons/:id" element={<ComparisonPage />} />
          <Route path="/history" element={<History />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<p className="empty">Page not found.</p>} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="wrap">
          <div className="footer-stripe" aria-hidden />
          <p>
            Timing data from <a href="https://openf1.org" target="_blank" rel="noreferrer">OpenF1</a>. PitWall is unofficial and not associated with Formula 1.
          </p>
        </div>
      </footer>
    </div>
  );
}
