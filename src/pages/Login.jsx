import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LoginForm from "../components/LoginForm.jsx";
import { useAuth } from "../services/auth.js";

export default function Login() {
  const {
    error,
    login,
    completePasswordReset,
    requestPasswordReset,
    requestSignupCode,
    status,
    verifyPasswordReset,
    verifySignupCode,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notice] = useState(() => location.state?.notice || "");

  // Consume the one-shot notice so refresh does not resurrect it.
  useEffect(() => {
    if (location.state?.notice) {
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  async function handleAuthenticated() {
    navigate("/", { replace: true });
  }

  return (
    <main className="flex min-h-dvh w-full justify-center overflow-y-auto bg-white dark:bg-slate-900 sm:items-center sm:bg-slate-100 sm:dark:bg-slate-950 sm:p-4">
      <section
        className="flex min-h-dvh w-full max-w-[420px] flex-col bg-white px-6 py-9 dark:bg-slate-900 sm:min-h-[640px] sm:rounded-[28px] sm:px-8 sm:shadow-xl sm:ring-1 sm:ring-slate-200 sm:dark:ring-slate-800"
        aria-label="Cashly account"
      >
        {notice ? (
          <p
            className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            role="status"
          >
            {notice}
          </p>
        ) : null}

        <LoginForm
          onAuthenticated={handleAuthenticated}
          onLogin={login}
          onCompleteReset={completePasswordReset}
          onRequestReset={requestPasswordReset}
          onRequestSignupCode={requestSignupCode}
          onVerifyReset={verifyPasswordReset}
          onVerifySignupCode={verifySignupCode}
          sessionError={status === "error" ? error : ""}
        />
      </section>
    </main>
  );
}
