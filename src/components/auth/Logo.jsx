import { cn } from "../../lib/utils.js";

// Cashly wordmark + mark. Mark = three forward-slanted bars (kept from the
// original monex logo styling), wordmark rebranded to "Cashly".
export default function Logo({ className }) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        role="img"
        aria-label="Cashly"
      >
        <rect x="6" y="9" width="24" height="6" rx="3" transform="skewX(-20)" fill="#1f2ce0" />
        <rect x="2" y="17" width="24" height="6" rx="3" transform="skewX(-20)" fill="#2b3ff2" />
        <rect x="-2" y="25" width="24" height="6" rx="3" transform="skewX(-20)" fill="#4053ff" />
      </svg>
      <span className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        Cashly
      </span>
    </div>
  );
}
