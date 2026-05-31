import { ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoginForm from "../components/LoginForm.jsx";
import { useAuth } from "../services/auth.js";

export default function Login() {
  const { error, login, refreshAuth, status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const notice = location.state?.notice;

  async function handleLogin(password) {
    await login(password);
    navigate("/", { replace: true });
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-heading">
          <div className="login-icon" aria-hidden="true">
            <ShieldCheck size={28} />
          </div>
          <div>
            <p className="eyebrow">Private tracker</p>
            <h1 id="login-title">Expense Tracker</h1>
          </div>
        </div>

        {status === "error" && error ? (
          <ErrorState
            title="Session unavailable"
            message={error}
            actionLabel="Check again"
            onRetry={refreshAuth}
          />
        ) : null}

        {notice ? <p className="notice-message">{notice}</p> : null}

        <LoginForm onSubmit={handleLogin} />
      </section>
    </main>
  );
}
