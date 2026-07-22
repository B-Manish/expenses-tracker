import {
  Clock,
  IndianRupee,
  LogOut,
  Moon,
  Save,
  Settings as SettingsIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import McpTokens from "../components/McpTokens.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SelectControl from "../components/SelectControl.jsx";
import { Button } from "../components/ui/button.jsx";
import { ApiError, api } from "../services/api.js";
import { useAuth } from "../services/auth.js";
import { setStoredWeekStartDay } from "../utils/dateUtils.js";
import { setStoredTheme, subscribeTheme } from "../utils/theme.js";
import {
  getErrorMessage,
  getFirstValidationError,
  validateSettingsForm,
} from "../utils/validation.js";

const DEFAULT_SETTINGS = {
  currency: "INR",
  theme: "system",
  weekStartDay: "MONDAY",
  timezone: "Asia/Kolkata",
};

const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const weekStartOptions = [
  { value: "SUNDAY", label: "Sunday" },
  { value: "MONDAY", label: "Monday" },
  { value: "TUESDAY", label: "Tuesday" },
  { value: "WEDNESDAY", label: "Wednesday" },
  { value: "THURSDAY", label: "Thursday" },
  { value: "FRIDAY", label: "Friday" },
  { value: "SATURDAY", label: "Saturday" },
];
const currencyOptions = [
  { value: "INR", label: "INR" },
];

function normalizeSettings(settings = {}) {
  const theme = themeOptions.some((option) => option.value === settings.theme)
    ? settings.theme
    : DEFAULT_SETTINGS.theme;
  const weekStartDay = weekStartOptions.some((option) => option.value === settings.weekStartDay)
    ? settings.weekStartDay
    : DEFAULT_SETTINGS.weekStartDay;

  return {
    currency: settings.currency === "INR" ? settings.currency : DEFAULT_SETTINGS.currency,
    theme,
    weekStartDay,
    timezone: settings.timezone === "Asia/Kolkata" ? settings.timezone : DEFAULT_SETTINGS.timezone,
  };
}

function getWeekStartLabel(value) {
  return weekStartOptions.find((option) => option.value === value)?.label || "Monday";
}

export default function Settings() {
  const { logout, markUnauthenticated } = useAuth();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState({
    error: "",
    settings: DEFAULT_SETTINGS,
    status: "loading",
  });
  const [formValues, setFormValues] = useState(DEFAULT_SETTINGS);
  const [saveState, setSaveState] = useState({
    error: "",
    message: "",
    status: "idle",
  });
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoadState((current) => ({
      ...current,
      error: "",
      status: "loading",
    }));
    setSaveState({
      error: "",
      message: "",
      status: "idle",
    });

    try {
      const settings = normalizeSettings(await api.getSettings());

      setLoadState({
        error: "",
        settings,
        status: "ready",
      });
      setFormValues(settings);
      setStoredWeekStartDay(settings.weekStartDay);
    } catch (settingsError) {
      if (settingsError instanceof ApiError && settingsError.status === 401) {
        markUnauthenticated();
        navigate("/login", {
          replace: true,
          state: { notice: "Please log in again to manage settings." },
        });
        return;
      }

      const settings = DEFAULT_SETTINGS;

      setLoadState({
        error: getErrorMessage(settingsError, "Settings could not be loaded."),
        settings,
        status: "fallback",
      });
      setFormValues(settings);
    }
  }, [markUnauthenticated, navigate]);

  // Deferred so the loading setState inside loadSettings is not synchronous
  // in the effect body; the cleanup also dedupes StrictMode's double mount.
  useEffect(() => {
    const timer = setTimeout(loadSettings, 0);

    return () => clearTimeout(timer);
  }, [loadSettings]);

  // Keep the theme select current when the sidebar toggle changes the theme
  // while this page is open.
  useEffect(() => subscribeTheme((mode) => {
    setFormValues((current) => (current.theme === mode ? current : { ...current, theme: mode }));
  }), []);

  const hasChanges = useMemo(
    () => Object.keys(DEFAULT_SETTINGS).some((key) => formValues[key] !== loadState.settings[key]),
    [formValues, loadState.settings],
  );
  const isSaving = saveState.status === "saving";
  const canSave = loadState.status === "ready" && hasChanges && !isSaving;

  function updateSettingField(name, value) {
    setFormValues((current) => ({
      ...current,
      [name]: value,
    }));

    if (name === "theme") {
      setStoredTheme(value);
    }

    setSaveState({
      error: "",
      message: "",
      status: "idle",
    });
  }

  function resetChanges() {
    setFormValues(loadState.settings);
    // Theme is applied live while editing; undo that side effect too.
    setStoredTheme(loadState.settings.theme);
    setSaveState({
      error: "",
      message: "",
      status: "idle",
    });
  }

  async function handleSave(event) {
    event.preventDefault();

    const validation = validateSettingsForm(formValues);

    if (!validation.isValid) {
      setSaveState({
        error: getFirstValidationError(validation.errors),
        message: "",
        status: "error",
      });
      return;
    }

    setSaveState({
      error: "",
      message: "",
      status: "saving",
    });

    try {
      const settings = normalizeSettings(await api.updateSettings(formValues));

      setLoadState({
        error: "",
        settings,
        status: "ready",
      });
      setFormValues(settings);
      setStoredTheme(settings.theme);
      setStoredWeekStartDay(settings.weekStartDay);
      setSaveState({
        error: "",
        message: "Settings saved.",
        status: "saved",
      });
    } catch (settingsError) {
      if (settingsError instanceof ApiError && settingsError.status === 401) {
        markUnauthenticated();
        navigate("/login", {
          replace: true,
          state: { notice: "Please log in again to manage settings." },
        });
        return;
      }

      setSaveState({
        error: getErrorMessage(settingsError, "Settings could not be saved."),
        message: "",
        status: "error",
      });
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (logoutError) {
      navigate("/login", {
        replace: true,
        state: {
          notice: `Signed out locally. ${getErrorMessage(logoutError, "Server logout did not complete.")}`,
        },
      });
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (loadState.status === "loading") {
    return <LoadingState title="Loading settings" />;
  }

  return (
    <section className="page-section" aria-labelledby="settings-title">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        titleId="settings-title"
        description="Manage local preferences and account session controls."
      />

      {loadState.status === "fallback" ? (
        <ErrorState
          title="Settings API unavailable"
          message={`${loadState.error} Safe defaults are shown until the API responds.`}
          actionLabel="Retry"
          onRetry={loadSettings}
        />
      ) : null}

      <section className="panel" aria-labelledby="preferences-title">
        <div className="panel-header">
          <div>
            <h2 id="preferences-title">Preferences</h2>
            <p>Currency, theme, week start, and local timezone.</p>
          </div>
          <div className="settings-summary" aria-label="Current settings summary">
            <span>{formValues.currency}</span>
            <span>{getWeekStartLabel(formValues.weekStartDay)}</span>
            <span>{formValues.timezone}</span>
          </div>
        </div>

        <form className="settings-form" onSubmit={handleSave}>
          <div className="settings-form-grid">
            <label className="form-field">
              <span>
                <IndianRupee size={16} aria-hidden="true" />
                Currency
              </span>
              <SelectControl
                disabled={loadState.status !== "ready" || isSaving}
                onChange={(value) => updateSettingField("currency", value)}
                options={currencyOptions}
                value={formValues.currency}
              />
              <span className="field-hint">Only INR is supported in this MVP.</span>
            </label>

            <label className="form-field">
              <span>
                <Moon size={16} aria-hidden="true" />
                Theme
              </span>
              <SelectControl
                disabled={loadState.status !== "ready" || isSaving}
                onChange={(value) => updateSettingField("theme", value)}
                options={themeOptions}
                value={formValues.theme}
              />
              <span className="field-hint">Applies immediately on this device.</span>
            </label>

            <label className="form-field">
              <span>
                <SettingsIcon size={16} aria-hidden="true" />
                Week starts
              </span>
              <SelectControl
                disabled={loadState.status !== "ready" || isSaving}
                onChange={(value) => updateSettingField("weekStartDay", value)}
                options={weekStartOptions}
                value={formValues.weekStartDay}
              />
              <span className="field-hint">Dashboard week totals use this setting.</span>
            </label>

            <div className="form-field">
              <span>
                <Clock size={16} aria-hidden="true" />
                Timezone
              </span>
              <div className="readonly-value">{formValues.timezone}</div>
              <span className="field-hint">Asia/Kolkata is used for date summaries.</span>
            </div>
          </div>

          {saveState.error ? <p className="form-error" role="alert">{saveState.error}</p> : null}
          {saveState.message ? <p className="success-message" role="status">{saveState.message}</p> : null}

          <div className="form-actions">
            <Button
              type="button"
              onClick={resetChanges}
              disabled={!hasChanges || isSaving}
              variant="outline"
            >
              Reset
            </Button>
            <Button type="submit" disabled={!canSave}>
              <Save size={18} aria-hidden="true" />
              {isSaving ? "Saving" : "Save settings"}
            </Button>
          </div>
        </form>
      </section>

      <McpTokens />

      <section className="panel danger-panel narrow-section" aria-labelledby="session-title">
        <div>
          <h2 id="session-title">Session</h2>
          <p>Sign out of this browser.</p>
        </div>
        <Button type="button" onClick={handleLogout} disabled={isLoggingOut} variant="destructive">
          <LogOut size={18} aria-hidden="true" />
          {isLoggingOut ? "Signing out" : "Logout"}
        </Button>
      </section>
    </section>
  );
}
