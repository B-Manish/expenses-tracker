// Theme application is driven by localStorage so it works on every page
// without a global provider. Modes: "light" | "dark" | "system".
// Components that display the current mode (ThemeToggle, Settings) subscribe
// so every entry point stays in sync without a context provider.
const STORAGE_KEY = "theme";
const VALID = new Set(["light", "dark", "system"]);
const listeners = new Set();

let systemListenerCleanup = null;

export function resolveTheme(mode) {
  if (mode === "dark") {
    return "dark";
  }

  if (mode === "system" && typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return "light";
}

function applyResolved(mode) {
  document.documentElement.classList.toggle("dark", resolveTheme(mode) === "dark");
}

export function applyTheme(mode) {
  if (typeof document === "undefined") {
    return;
  }

  applyResolved(mode);

  // In system mode, follow live OS theme changes.
  systemListenerCleanup?.();
  systemListenerCleanup = null;

  if (mode === "system" && typeof window !== "undefined" && window.matchMedia) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyResolved(mode);
      listeners.forEach((listener) => listener(mode));
    };

    media.addEventListener("change", onChange);
    systemListenerCleanup = () => media.removeEventListener("change", onChange);
  }
}

export function subscribeTheme(listener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);

    if (VALID.has(value)) {
      return value;
    }
  } catch {
    // localStorage may be unavailable (private mode); fall back to light.
  }

  return "light";
}

export function setStoredTheme(mode) {
  const next = VALID.has(mode) ? mode : "light";

  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore persistence failures; still apply for this session.
  }

  applyTheme(next);
  listeners.forEach((listener) => listener(next));

  return next;
}
