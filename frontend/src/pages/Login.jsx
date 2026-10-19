import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function Login() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", display_name: "", notify_email: true });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = mode === "login" ? { email: form.email, password: form.password } : form;
      signIn(await api(`/auth/${mode === "login" ? "login" : "register"}`, { method: "POST", body }));
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="auth panel" onSubmit={submit}>
      <h1>{mode === "login" ? "Sign in" : "Create an account"}</h1>
      {mode === "register" && (
        <label>
          Name
          <input value={form.display_name} onChange={set("display_name")} required maxLength={80} autoComplete="nickname" />
        </label>
      )}
      <label>
        Email
        <input type="email" value={form.email} onChange={set("email")} required autoComplete="email" />
      </label>
      <label>
        Password
        <input type="password" value={form.password} onChange={set("password")} required minLength={mode === "register" ? 8 : 1}
          autoComplete={mode === "login" ? "current-password" : "new-password"} />
      </label>
      {mode === "register" && (
        <label className="check">
          <input type="checkbox" checked={form.notify_email} onChange={set("notify_email")} />
          Email me when a comparison is ready (you'll get one confirmation email first)
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "…" : mode === "login" ? "Sign in" : "Create account"}</button>
      <button type="button" className="link" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
        {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
