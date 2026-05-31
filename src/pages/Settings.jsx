import {
  Clock,
  Download,
  IndianRupee,
  Landmark,
  LogOut,
  Moon,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { ApiError, api } from "../services/api.js";
import { useAuth } from "../services/auth.js";
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
  const { logout } = useAuth();
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
    } catch (settingsError) {
      if (settingsError instanceof ApiError && settingsError.status === 401) {
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
  }, [navigate]);

  useEffect(() => {
    let isCurrent = true;

    api.getSettings()
      .then((settings) => {
        if (isCurrent) {
          const normalized = normalizeSettings(settings);

          setLoadState({
            error: "",
            settings: normalized,
            status: "ready",
          });
          setFormValues(normalized);
        }
      })
      .catch((settingsError) => {
        if (isCurrent) {
          if (settingsError instanceof ApiError && settingsError.status === 401) {
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
      });

    return () => {
      isCurrent = false;
    };
  }, [navigate]);

  const hasChanges = useMemo(
    () => Object.keys(DEFAULT_SETTINGS).some((key) => formValues[key] !== loadState.settings[key]),
    [formValues, loadState.settings],
  );
  const isSaving = saveState.status === "saving";
  const canSave = loadState.status === "ready" && hasChanges && !isSaving;

  function handleFieldChange(event) {
    const { name, value } = event.target;

    setFormValues((current) => ({
      ...current,
      [name]: value,
    }));
    setSaveState({
      error: "",
      message: "",
      status: "idle",
    });
  }

  function resetChanges() {
    setFormValues(loadState.settings);
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
      setSaveState({
        error: "",
        message: "Settings saved.",
        status: "saved",
      });
    } catch (settingsError) {
      if (settingsError instanceof ApiError && settingsError.status === 401) {
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
    return <LoadingState title="Loading settings" message="Fetching your app preferences." />;
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
              <select
                name="currency"
                value={formValues.currency}
                onChange={handleFieldChange}
                disabled={loadState.status !== "ready" || isSaving}
              >
                <option value="INR">INR</option>
              </select>
              <span className="field-hint">Only INR is supported in this MVP.</span>
            </label>

            <label className="form-field">
              <span>
                <Moon size={16} aria-hidden="true" />
                Theme
              </span>
              <select
                name="theme"
                value={formValues.theme}
                onChange={handleFieldChange}
                disabled={loadState.status !== "ready" || isSaving}
              >
                {themeOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">Stored as a preference; full theme styling can come later.</span>
            </label>

            <label className="form-field">
              <span>
                <SettingsIcon size={16} aria-hidden="true" />
                Week starts
              </span>
              <select
                name="weekStartDay"
                value={formValues.weekStartDay}
                onChange={handleFieldChange}
                disabled={loadState.status !== "ready" || isSaving}
              >
                {weekStartOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
            <button
              className="button secondary-button"
              type="button"
              onClick={resetChanges}
              disabled={!hasChanges || isSaving}
            >
              Reset
            </button>
            <button className="button primary-button" type="submit" disabled={!canSave}>
              <Save size={18} aria-hidden="true" />
              {isSaving ? "Saving" : "Save settings"}
            </button>
          </div>
        </form>
      </section>

      <div className="content-grid two-column-grid">
        <section className="panel placeholder-panel" aria-labelledby="export-title">
          <div className="placeholder-icon" aria-hidden="true">
            <Download size={20} />
          </div>
          <div>
            <p className="eyebrow">Future feature</p>
            <h2 id="export-title">Data export</h2>
            <p>Export is not implemented yet. This control is disabled and does not download fake data.</p>
          </div>
          <button className="button secondary-button" type="button" disabled>
            Export unavailable
          </button>
        </section>

        <section className="panel placeholder-panel danger-panel" aria-labelledby="delete-data-title">
          <div className="placeholder-icon danger-placeholder-icon" aria-hidden="true">
            <Trash2 size={20} />
          </div>
          <div>
            <p className="eyebrow">Future feature</p>
            <h2 id="delete-data-title">Delete all data</h2>
            <p>Bulk deletion is not implemented in the MVP. This disabled control does not remove any data.</p>
          </div>
          <button className="button danger-button" type="button" disabled>
            Delete unavailable
          </button>
        </section>

        <section className="panel placeholder-panel wide-panel" aria-labelledby="bank-placeholder-title">
          <div className="placeholder-icon success-placeholder-icon" aria-hidden="true">
            <Landmark size={20} />
          </div>
          <div>
            <p className="eyebrow">Future module</p>
            <h2 id="bank-placeholder-title">Bank connection</h2>
            <p>
              Status: <strong>Not connected</strong>. Future bank support should use a consent-based Account
              Aggregator-style flow. No bank credential fields are present in this MVP.
            </p>
          </div>
          <div className="placeholder-status">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>Manual tracking only</span>
          </div>
          <button className="button secondary-button" type="button" disabled>
            Connect unavailable
          </button>
        </section>
      </div>

      <section className="panel danger-panel narrow-section" aria-labelledby="session-title">
        <div>
          <h2 id="session-title">Session</h2>
          <p>Sign out of this browser.</p>
        </div>
        <button className="button danger-button" type="button" onClick={handleLogout} disabled={isLoggingOut}>
          <LogOut size={18} aria-hidden="true" />
          {isLoggingOut ? "Signing out" : "Logout"}
        </button>
      </section>
    </section>
  );
}
