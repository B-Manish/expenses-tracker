import { cn } from "../../lib/utils.js";

// Gradient blue pill button used for the primary action on every Cashly screen
// (LOGIN, RESET PASSWORD, BACK TO LOGIN). Arbitrary linear-gradient value keeps
// it stable across Tailwind v4 gradient-utility renames.
export default function GradientButton({ className, children, ...props }) {
  return (
    <button
      className={cn(
        "h-12 w-full rounded-full bg-[image:var(--primary-gradient)] text-sm font-semibold uppercase tracking-wide text-white shadow-md shadow-[#2b3ff2]/25 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
