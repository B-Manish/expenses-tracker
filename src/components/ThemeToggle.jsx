import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { getStoredTheme, resolveTheme, setStoredTheme } from "../utils/theme.js";

export default function ThemeToggle({ onToggle }) {
  const [mode, setMode] = useState(() => getStoredTheme());
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
