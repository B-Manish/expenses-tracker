import { Eye, EyeOff, KeyRound, LogIn, Mail, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  getErrorMessage,
  validatePassword,
  validatePasswordConfirmation,
} from "../utils/validation.js";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";

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

export default function LoginForm({
  onAuthenticated,
  onCompleteReset,
  onLogin,
  onRequestReset,
  onRequestSignupCode,
  onVerifyReset,
  onVerifySignupCode,
}) {
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState("details");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  function resetForMode(nextMode) {
    setMode(nextMode);
    setStep("details");
    setCode("");
    setResetToken("");
    setError("");
    setSuccess("");
  }

  async function requestResetCode() {
    const emailError = validateEmail(email);

    if (emailError) {
      setError(emailError);
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const result = await onRequestReset(email.trim());
      const minutes = result?.expiresInMinutes || 10;
      const devCode = result?.devCode ? ` Dev code: ${result.devCode}` : "";

      setMode("reset");
      setStep("code");
      setCode("");
      setPassword("");
      setConfirmPassword("");
      setSuccess(`Verification code sent to your email. It expires in ${minutes} minutes.${devCode}`);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not send verification code."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyResetCode(event) {
    event.preventDefault();

    if (!/^[0-9]{6}$/.test(code)) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const result = await onVerifyReset(email.trim(), code);
      const minutes = result?.expiresInMinutes || 15;

      setResetToken(result?.resetToken || "");
      setStep("reset-password");
      setCode("");
      setSuccess(`Code verified. Set a new password now. This reset session expires in ${minutes} minutes.`);
    } catch (verifyError) {
      setError(getErrorMessage(verifyError, "Could not verify code."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function completeReset(event) {
    event.preventDefault();

    const passwordError = validatePasswordConfirmation(password, confirmPassword);

    if (passwordError) {
      setError(passwordError);
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
      setMode("login");
      setStep("details");
      setResetToken("");
      setPassword("");
      setConfirmPassword("");
      setSuccess("Password updated. Sign in with your new password.");
    } catch (resetError) {
      setError(getErrorMessage(resetError, "Could not reset password."));
    } finally {
      setIsSubmitting(false);
    }
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
    setSuccess("");

    try {
      await onLogin(email.trim(), password);
      await onAuthenticated();
    } catch (loginError) {
      setError(getErrorMessage(loginError, "Could not sign in."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function requestSignupCode(event) {
    event.preventDefault();

    const fullNameError = validateFullName(fullName);
    const emailError = validateEmail(email);
    const passwordError = validatePasswordConfirmation(password, confirmPassword);

    if (fullNameError || emailError || passwordError) {
      setError(fullNameError || emailError || passwordError);
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const result = await onRequestSignupCode({
        email: email.trim(),
        fullName: fullName.trim(),
        password,
      });
      const minutes = result?.expiresInMinutes || 10;
      const devCode = result?.devCode ? ` Dev code: ${result.devCode}` : "";

      setStep("code");
      setCode("");
      setSuccess(`Verification code sent to your email. It expires in ${minutes} minutes.${devCode}`);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not send verification code."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifySignupCode(event) {
    event.preventDefault();

    if (!/^[0-9]{6}$/.test(code)) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await onVerifySignupCode(email.trim(), code);
      await onAuthenticated();
    } catch (verifyError) {
      setError(getErrorMessage(verifyError, "Could not verify code."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === "code") {
    return (
      <form className="login-form" onSubmit={isReset ? verifyResetCode : verifySignupCode}>
        <label className="form-field" htmlFor="email-code">
          <span>Verification code</span>
          <Input
            id="email-code"
            name="code"
            className="code-input"
            type="text"
            value={code}
            onChange={(event) => setCode(normalizeCodeInput(event.target.value))}
            autoComplete="one-time-code"
            disabled={isSubmitting}
            inputMode="numeric"
            maxLength={6}
          />
        </label>

        {success ? <p className="success-message" role="status">{success}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <Button className="login-button" type="submit" disabled={isSubmitting}>
          <KeyRound size={18} aria-hidden="true" />
          {isSubmitting ? "Verifying" : isReset ? "Verify code" : "Create account"}
        </Button>

        <div className="login-secondary-actions">
          <button
            className="text-link"
            type="button"
            onClick={() => {
              setMode("login");
              setStep("details");
            }}
            disabled={isSubmitting}
          >
            {isReset ? "Back to sign in" : "Edit details"}
          </button>
          <button
            className="text-link"
            type="button"
            onClick={() => {
              setCode("");
              setError("");
              setSuccess("");
            }}
            disabled={isSubmitting}
          >
            Clear code
          </button>
        </div>
      </form>
    );
  }

  if (step === "reset-password") {
    return (
      <form className="login-form" onSubmit={completeReset}>
        <label className="field-label" htmlFor="new-password">
          New password
        </label>
        <div className="password-field">
          <Input
            id="new-password"
            name="newPassword"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            disabled={isSubmitting}
          />
          <Button
            className="icon-button"
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            title={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((current) => !current)}
            disabled={isSubmitting}
            size="icon"
            variant="outline"
          >
            {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </Button>
        </div>

        <label className="field-label" htmlFor="reset-confirm-password">
          Confirm password
        </label>
        <div className="password-field">
          <Input
            id="reset-confirm-password"
            name="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            disabled={isSubmitting}
          />
          <Button
            className="icon-button"
            type="button"
            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            title={showConfirmPassword ? "Hide password" : "Show password"}
            onClick={() => setShowConfirmPassword((current) => !current)}
            disabled={isSubmitting}
            size="icon"
            variant="outline"
          >
            {showConfirmPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </Button>
        </div>

        {success ? <p className="success-message" role="status">{success}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <Button className="login-button" type="submit" disabled={isSubmitting}>
          <KeyRound size={18} aria-hidden="true" />
          {isSubmitting ? "Saving password" : "Set new password"}
        </Button>
      </form>
    );
  }

  return (
    <form className="login-form" onSubmit={isSignup ? requestSignupCode : handleLogin}>
      <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
        <Button
          type="button"
          variant={isSignup ? "outline" : "default"}
          onClick={() => resetForMode("login")}
          disabled={isSubmitting}
        >
          <LogIn size={18} aria-hidden="true" />
          Sign in
        </Button>
        <Button
          type="button"
          variant={isSignup ? "default" : "outline"}
          onClick={() => resetForMode("signup")}
          disabled={isSubmitting}
        >
          <UserPlus size={18} aria-hidden="true" />
          Sign up
        </Button>
      </div>

      {isSignup ? (
        <label className="form-field" htmlFor="full-name">
          <span>Full name</span>
          <Input
            id="full-name"
            name="fullName"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            disabled={isSubmitting}
            maxLength={120}
          />
        </label>
      ) : null}

      <label className="form-field" htmlFor="email">
        <span>Email</span>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          disabled={isSubmitting}
          inputMode="email"
          placeholder="name@example.com"
        />
      </label>

      <label className="field-label" htmlFor="auth-password">
        Password
      </label>
      <div className="password-field">
        <Input
          id="auth-password"
          name="password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={isSignup ? "new-password" : "current-password"}
          disabled={isSubmitting}
        />
        <Button
          className="icon-button"
          type="button"
          aria-label={showPassword ? "Hide password" : "Show password"}
          title={showPassword ? "Hide password" : "Show password"}
          onClick={() => setShowPassword((current) => !current)}
          disabled={isSubmitting}
          size="icon"
          variant="outline"
        >
          {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </Button>
      </div>

      {isSignup ? (
        <>
          <label className="field-label" htmlFor="confirm-password">
            Confirm password
          </label>
          <div className="password-field">
            <Input
              id="confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              disabled={isSubmitting}
            />
            <Button
              className="icon-button"
              type="button"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              title={showConfirmPassword ? "Hide password" : "Show password"}
              onClick={() => setShowConfirmPassword((current) => !current)}
              disabled={isSubmitting}
              size="icon"
              variant="outline"
            >
              {showConfirmPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </Button>
          </div>
        </>
      ) : null}

      {success ? <p className="success-message" role="status">{success}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <Button className="login-button" type="submit" disabled={isSubmitting}>
        {isSignup ? <Mail size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
        {isSubmitting
          ? isSignup ? "Sending code" : "Signing in"
          : isSignup ? "Send verification code" : "Sign in"}
      </Button>

      {!isSignup ? (
        <Button
          className="login-button"
          type="button"
          onClick={requestResetCode}
          disabled={isSubmitting}
          variant="outline"
        >
          <KeyRound size={18} aria-hidden="true" />
          Forgot / reset password
        </Button>
      ) : null}
    </form>
  );
}
