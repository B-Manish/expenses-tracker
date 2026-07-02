import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "../../lib/utils.js";

// Pill-shaped, controlled input matching the Cashly Figma: left icon, optional
// eye toggle for passwords, focus ring, and a red-tinted error state. The label
// is visually hidden (placeholder doubles as the visible label) but present for
// screen readers.
export default function PillField({
  label,
  icon: Icon,
  type = "text",
  error = false,
  id,
  className,
  ...props
}) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const isPassword = type === "password";
  const [reveal, setReveal] = useState(false);
  const inputType = isPassword ? (reveal ? "text" : "password") : type;

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="sr-only">
        {label}
      </label>
      <div
        className={cn(
          "flex h-12 items-center gap-3 rounded-full border px-4 transition-colors",
          "focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-ring/25 dark:focus-within:bg-slate-800",
          error
            ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
            : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800",
        )}
      >
        {Icon ? (
          <Icon
            size={18}
            aria-hidden="true"
            className={cn("shrink-0", error ? "text-red-400" : "text-slate-400")}
          />
        ) : null}
        <input
          id={fieldId}
          type={inputType}
          className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed dark:text-white dark:placeholder:text-slate-500"
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setReveal((current) => !current)}
            aria-label={reveal ? "Hide password" : "Show password"}
            aria-pressed={reveal}
            className="shrink-0 rounded-full text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40"
          >
            {reveal ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
