// Theme application is driven by localStorage so it works on every page
// without a global provider. Modes: "light" | "dark" | "system".
const STORAGE_KEY = "theme";
const VALID = new Set(["light", "dark", "system"]);

export function resolveTheme(mode) {
  if (mode === "dark") {
    return "dark";
  }

  if (mode === "system" && typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return "light";
}

export function applyTheme(mode) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.toggle("dark", resolveTheme(mode) === "dark");
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

  return next;
}
