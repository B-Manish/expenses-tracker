import {
  AlertCircle,
  ArrowLeft,
  Check,
  Circle,
  CreditCard,
  Lock,
  Mail,
  User,
} from "lucide-react";
import { useState } from "react";
import {
  evaluatePasswordChecklist,
  getErrorMessage,
  isPasswordChecklistComplete,
  validatePassword,
  validatePasswordConfirmation,
} from "../utils/validation.js";
import GradientButton from "./auth/GradientButton.jsx";
import Logo from "./auth/Logo.jsx";
import PillField from "./auth/PillField.jsx";

function normalizeCodeInput(value) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function validateEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Enter a valid email address.";
  }

  return "";
}

function validateFullName(fullName) {
  const trimmed = fullName.trim();

  if (trimmed.length < 2) {
    return "Full name must be at least 2 characters.";
  }

  if (trimmed.length > 120) {
    return "Full name must be 120 characters or less.";
  }

  return "";
}

function ErrorBanner({ message }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600 dark:bg-red-950/40 dark:text-red-300"
      role="alert"
    >
      <AlertCircle size={18} aria-hidden="true" className="shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function ChecklistItem({ label, satisfied }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {satisfied ? (
        <Check size={16} aria-hidden="true" className="shrink-0 text-primary" />
      ) : (
        <Circle size={16} aria-hidden="true" className="shrink-0 text-slate-300 dark:text-slate-600" />
      )}
      <span className={satisfied ? "text-primary" : "text-slate-400 dark:text-slate-500"}>{label}</span>
      <span className="sr-only">{satisfied ? "(met)" : "(not met)"}</span>
    </li>
  );
}

export default function LoginForm({
  onAuthenticated,
  onCompleteReset,
  onLogin,
  onRequestReset,
  onRequestSignupCode,
  onVerifyReset,
  onVerifySignupCode,
  sessionError = "",
}) {
  const [view, setView] = useState("login");
  const [codeContext, setCodeContext] = useState("reset");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checklist = evaluatePasswordChecklist(password, { email, name: fullName });
  const checklistComplete = isPasswordChecklistComplete(checklist);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  function goToLogin() {
    setView("login");
    setPassword("");
    setConfirmPassword("");
    setCode("");
    setResetToken("");
    setError("");
  }

  async function handleLogin(event) {
    event.preventDefault();

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);

    if (emailError || passwordError) {
      setError(emailError || passwordError);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await onLogin(email.trim(), password);
      await onAuthenticated();
    } catch (loginError) {
      setError(getErrorMessage(loginError, "Incorrect username or password"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function startPasswordReset() {
    const emailError = validateEmail(email);

    if (emailError) {
      setError("Enter your email above, then tap Forgot password.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const result = await onRequestReset(email.trim());
      const minutes = result?.expiresInMinutes || 10;
      const devCode = result?.devCode ? ` Dev code: ${result.devCode}.` : "";

      setCodeContext("reset");
      setCode("");
      setNotice(`We sent a 6-digit code to ${email.trim()}. It expires in ${minutes} minutes.${devCode}`);
      setView("code");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not send verification code."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();

    const fullNameError = validateFullName(fullName);
    const emailError = validateEmail(email);

    if (fullNameError || emailError) {
      setError(fullNameError || emailError);
      return;
    }

    // Same rules as the reset flow, so the two entry points cannot drift.
    if (!checklistComplete) {
      setError("Your password does not meet all the requirements yet.");
      return;
    }

    const passwordError = validatePasswordConfirmation(password, confirmPassword);

    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const result = await onRequestSignupCode({
        email: email.trim(),
        fullName: fullName.trim(),
        password,
      });
      const minutes = result?.expiresInMinutes || 10;
      const devCode = result?.devCode ? ` Dev code: ${result.devCode}.` : "";

      setCodeContext("signup");
      setCode("");
      setNotice(`We sent a 6-digit code to ${email.trim()}. It expires in ${minutes} minutes.${devCode}`);
      setView("code");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not send verification code."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault();

    if (!/^[0-9]{6}$/.test(code)) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      if (codeContext === "signup") {
        await onVerifySignupCode(email.trim(), code);
        await onAuthenticated();
        return;
      }

      const result = await onVerifyReset(email.trim(), code);

      setResetToken(result?.resetToken || "");
      setPassword("");
      setConfirmPassword("");
      setNotice("");
      setView("new-password");
    } catch (verifyError) {
      setError(getErrorMessage(verifyError, "Could not verify code."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCompleteReset(event) {
    event.preventDefault();

    if (!checklistComplete) {
      setError("Your password does not meet all the requirements yet.");
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    if (!resetToken) {
      setError("Reset session expired. Request a new code.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await onCompleteReset(resetToken, password);
      setView("success");
    } catch (resetError) {
      setError(getErrorMessage(resetError, "Could not reset password."));
    } finally {
      setIsSubmitting(false);
    }
  }

  // --- Login -------------------------------------------------------------
  if (view === "login") {
    const bannerError = error || sessionError;

    return (
      <form className="flex flex-1 flex-col" onSubmit={handleLogin}>
        <Logo className="mb-8 mt-2" />

        {bannerError ? (
          <div className="mb-4">
            <ErrorBanner message={bannerError} />
          </div>
        ) : null}

        <div className="space-y-3">
          <PillField
            label="Email"
            icon={Mail}
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            autoComplete="email"
            inputMode="email"
            error={Boolean(bannerError)}
            disabled={isSubmitting}
          />
          <PillField
            label="Password"
            icon={Lock}
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            error={Boolean(bannerError)}
            disabled={isSubmitting}
          />
        </div>

        <div className="mt-6">
          <GradientButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Login"}
          </GradientButton>
        </div>

        <button
          type="button"
          onClick={startPasswordReset}
          disabled={isSubmitting}
          className="mx-auto mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
        >
          Forgot password
        </button>

        <p className="mt-auto pt-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              setPassword("");
              setView("signup");
            }}
            className="font-semibold text-primary hover:underline"
          >
            Register here
          </button>
        </p>
      </form>
    );
  }

  // --- Sign up -----------------------------------------------------------
  if (view === "signup") {
    return (
      <form className="flex flex-1 flex-col" onSubmit={handleSignup}>
        <button
          type="button"
          onClick={goToLogin}
          className="mb-6 -ml-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Back to login"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>

        <Logo className="mb-8" />

        {error ? (
          <div className="mb-4">
            <ErrorBanner message={error} />
          </div>
        ) : null}

        <div className="space-y-3">
          <PillField
            label="Full name"
            icon={User}
            type="text"
            name="fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Full name"
            autoComplete="name"
            maxLength={120}
            disabled={isSubmitting}
          />
          <PillField
            label="Email"
            icon={Mail}
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            autoComplete="email"
            inputMode="email"
            disabled={isSubmitting}
          />
          <PillField
            label="Password"
            icon={Lock}
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="new-password"
            disabled={isSubmitting}
          />
          <PillField
            label="Confirm password"
            icon={Lock}
            type="password"
            name="confirmPassword"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm password"
            autoComplete="new-password"
            error={confirmPassword.length > 0 && !passwordsMatch}
            disabled={isSubmitting}
          />
        </div>

        <ul className="mt-5 space-y-2.5">
          <ChecklistItem label="Must not contain your name or email" satisfied={checklist.noNameOrEmail} />
          <ChecklistItem label="At least 8 characters" satisfied={checklist.minLength} />
          <ChecklistItem label="Contains a symbol or a number" satisfied={checklist.hasSymbolOrNumber} />
        </ul>

        <div className="mt-6">
          <GradientButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending code…" : "Create account"}
          </GradientButton>
        </div>
      </form>
    );
  }

  // --- Verify code -------------------------------------------------------
  if (view === "code") {
    return (
      <form className="flex flex-1 flex-col" onSubmit={handleVerifyCode}>
        <button
          type="button"
          onClick={() => {
            setError("");
            setView(codeContext === "signup" ? "signup" : "login");
          }}
          className="mb-6 -ml-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Back"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Enter the code</h1>
        {notice ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{notice}</p> : null}

        {error ? (
          <div className="mb-4 mt-5">
            <ErrorBanner message={error} />
          </div>
        ) : null}

        <div className="mt-6">
          <PillField
            label="6-digit verification code"
            type="text"
            name="code"
            value={code}
            onChange={(event) => setCode(normalizeCodeInput(event.target.value))}
            placeholder="••••••"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            className="[&_input]:tracking-[0.5em]"
            disabled={isSubmitting}
          />
        </div>

        <div className="mt-6">
          <GradientButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Verifying…" : codeContext === "signup" ? "Verify & continue" : "Verify code"}
          </GradientButton>
        </div>
      </form>
    );
  }

  // --- Create new password (live checklist) ------------------------------
  if (view === "new-password") {
    const resetDisabled = isSubmitting || !checklistComplete || !passwordsMatch;

    return (
      <form className="flex flex-1 flex-col" onSubmit={handleCompleteReset}>
        <button
          type="button"
          onClick={() => {
            setError("");
            setView("code");
          }}
          className="mb-6 -ml-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Back"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>

        <h1 className="text-2xl font-bold leading-tight text-slate-900 dark:text-white">
          Create Your New Password
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Your new password must be different from previous password.
        </p>

        {error ? (
          <div className="mt-5">
            <ErrorBanner message={error} />
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          <PillField
            label="New password"
            icon={Lock}
            type="password"
            name="newPassword"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="new-password"
            disabled={isSubmitting}
          />
          <PillField
            label="Confirm new password"
            icon={Lock}
            type="password"
            name="confirmPassword"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm password"
            autoComplete="new-password"
            error={confirmPassword.length > 0 && !passwordsMatch}
            disabled={isSubmitting}
          />
        </div>

        <ul className="mt-5 space-y-2.5">
          <ChecklistItem label="Must not contain your name or email" satisfied={checklist.noNameOrEmail} />
          <ChecklistItem label="At least 8 characters" satisfied={checklist.minLength} />
          <ChecklistItem label="Contains a symbol or a number" satisfied={checklist.hasSymbolOrNumber} />
        </ul>

        <div className="mt-auto pt-8">
          <GradientButton type="submit" disabled={resetDisabled}>
            {isSubmitting ? "Resetting…" : "Reset password"}
          </GradientButton>
        </div>
      </form>
    );
  }

  // --- Success -----------------------------------------------------------
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="relative mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-accent dark:bg-blue-950/40">
        <CreditCard size={40} aria-hidden="true" className="text-primary" />
        <span className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white ring-4 ring-white dark:ring-slate-900">
          <Check size={18} aria-hidden="true" />
        </span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Password updated!</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Your password has been setup successfully
      </p>

      <div className="mt-auto w-full pt-10">
        <GradientButton type="button" onClick={goToLogin}>
          Back to login
        </GradientButton>
      </div>
    </div>
  );
}
