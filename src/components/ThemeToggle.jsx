import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { getStoredTheme, resolveTheme, setStoredTheme, subscribeTheme } from "../utils/theme.js";

export default function ThemeToggle({ onToggle }) {
  const [mode, setMode] = useState(() => getStoredTheme());

  // Stay in sync when the theme changes elsewhere (Settings page, another
  // toggle instance, an OS switch while in system mode).
  useEffect(() => subscribeTheme(() => setMode(getStoredTheme())), []);

  const isDark = resolveTheme(mode) === "dark";

  function toggle() {
    const next = isDark ? "light" : "dark";
    setMode(setStoredTheme(next));
    onToggle?.(next);
  }

  return (
    <button
      aria-pressed={isDark}
      className="nav-link w-full"
      onClick={toggle}
      type="button"
    >
      {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
