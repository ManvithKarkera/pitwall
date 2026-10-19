import { Link, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Races from "./pages/Races.jsx";
import SessionPage from "./pages/SessionPage.jsx";
import ComparisonPage from "./pages/ComparisonPage.jsx";
import History from "./pages/History.jsx";
import Login from "./pages/Login.jsx";

export default function App() {
  const { user, signOut } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
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
              <span className="muted">{user.display_name}</span>
              <button className="link" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <NavLink to="/login">Sign in</NavLink>
          )}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Races />} />
          <Route path="/sessions/:id" element={<SessionPage />} />
          <Route path="/comparisons/:id" element={<ComparisonPage />} />
          <Route path="/history" element={<History />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<p className="empty">Page not found.</p>} />
        </Routes>
      </main>
      <footer className="footer muted">
        Timing data from <a href="https://openf1.org" target="_blank" rel="noreferrer">OpenF1</a>. PitWall is unofficial and not associated with Formula 1.
      </footer>
    </div>
  );
}
