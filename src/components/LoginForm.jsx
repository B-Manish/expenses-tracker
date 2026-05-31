import { Eye, EyeOff, KeyRound, LogIn, Mail } from "lucide-react";
import { useState } from "react";
import { getErrorMessage, validatePassword, validateResetCode } from "../utils/validation.js";

export default function LoginForm({ onRequestReset, onSubmit, onVerifyReset }) {
  const [password, setPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [mode, setMode] = useState("password");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingCode, setIsRequestingCode] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    const validationError = validatePassword(password);

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await onSubmit(password);
      setPassword("");
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Login failed."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRequestReset() {
    setIsRequestingCode(true);
    setError("");
    setSuccess("");

    try {
      const result = await onRequestReset();
      const destination = result?.email || "your email";
      const minutes = result?.expiresInMinutes || 10;

      setMode("code");
      setResetCode("");
      setSuccess(`Verification code sent to ${destination}. It expires in ${minutes} minutes.`);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not send verification code."));
    } finally {
      setIsRequestingCode(false);
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault();

    const validationError = validateResetCode(resetCode);

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await onVerifyReset(resetCode);
      setResetCode("");
    } catch (verifyError) {
      setError(getErrorMessage(verifyError, "Could not verify code."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCodeChange(event) {
    setResetCode(event.target.value.replace(/\D/g, "").slice(0, 6));
  }

  if (mode === "code") {
    return (
      <form className="login-form" onSubmit={handleVerifyCode}>
        <label className="form-field" htmlFor="reset-code">
          <span>Verification code</span>
          <input
            id="reset-code"
            name="code"
            className="code-input"
            type="text"
            value={resetCode}
            onChange={handleCodeChange}
            autoComplete="one-time-code"
            disabled={isSubmitting}
            inputMode="numeric"
            maxLength={6}
          />
        </label>

        {success ? <p className="success-message" role="status">{success}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <button className="button primary-button login-button" type="submit" disabled={isSubmitting}>
          <KeyRound size={18} aria-hidden="true" />
          {isSubmitting ? "Verifying" : "Verify and sign in"}
        </button>

        <div className="login-secondary-actions">
          <button
            className="text-link"
            type="button"
            onClick={handleRequestReset}
            disabled={isRequestingCode || isSubmitting}
          >
            {isRequestingCode ? "Sending code" : "Send a new code"}
          </button>
          <button
            className="text-link"
            type="button"
            onClick={() => {
              setMode("password");
              setError("");
              setSuccess("");
            }}
            disabled={isSubmitting}
          >
            Use password instead
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field-label" htmlFor="app-password">
        App password
      </label>
      <div className="password-field">
        <input
          id="app-password"
          name="password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          disabled={isSubmitting}
        />
        <button
          className="icon-button"
          type="button"
          aria-label={showPassword ? "Hide password" : "Show password"}
          title={showPassword ? "Hide password" : "Show password"}
          onClick={() => setShowPassword((current) => !current)}
          disabled={isSubmitting}
        >
          {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>

      {success ? <p className="success-message" role="status">{success}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <button className="button primary-button login-button" type="submit" disabled={isSubmitting}>
        <LogIn size={18} aria-hidden="true" />
        {isSubmitting ? "Signing in" : "Sign in"}
      </button>

      <button
        className="button secondary-button login-button"
        type="button"
        onClick={handleRequestReset}
        disabled={isRequestingCode || isSubmitting}
      >
        <Mail size={18} aria-hidden="true" />
        {isRequestingCode ? "Sending code" : "Forgot password?"}
      </button>
    </form>
  );
}
