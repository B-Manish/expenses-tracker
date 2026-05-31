import { Eye, EyeOff, LogIn } from "lucide-react";
import { useState } from "react";
import { getErrorMessage, validatePassword } from "../utils/validation.js";

export default function LoginForm({ onSubmit }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    const validationError = validatePassword(password);

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await onSubmit(password);
      setPassword("");
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Login failed."));
    } finally {
      setIsSubmitting(false);
    }
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

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <button className="button primary-button login-button" type="submit" disabled={isSubmitting}>
        <LogIn size={18} aria-hidden="true" />
        {isSubmitting ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
