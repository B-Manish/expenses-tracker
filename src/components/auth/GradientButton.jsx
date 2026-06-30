import { cn } from "../../lib/utils.js";

// Gradient blue pill button used for the primary action on every Cashly screen
// (LOGIN, RESET PASSWORD, BACK TO LOGIN). Arbitrary linear-gradient value keeps
// it stable across Tailwind v4 gradient-utility renames.
export default function GradientButton({ className, children, ...props }) {
  return (
    <button
      className={cn(
        "h-12 w-full rounded-full bg-[linear-gradient(135deg,#2563eb_0%,#3b82f6_100%)] text-sm font-semibold uppercase tracking-wide text-white shadow-md shadow-blue-600/25 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
