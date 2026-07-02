import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils.js";

// Horizontal category picker from the reference design: dashed "+" chip that
// links to category management, then one pill per category. Tapping the
// selected chip clears it back to uncategorized.
export default function CategoryChips({
  categories = [],
  disabled = false,
  onChange,
  value = "",
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        aria-label="Manage categories"
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-input text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        to="/categories"
      >
        <Plus size={18} aria-hidden="true" />
      </Link>
      {categories.map((category) => {
        const id = String(category.id);
        const isActive = value === id;

        return (
          <button
            aria-pressed={isActive}
            className={cn(
              "inline-flex min-h-12 items-center rounded-2xl px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "rounded-[1.4rem] bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "border border-border/60 bg-card text-foreground shadow-sm hover:bg-muted",
            )}
            disabled={disabled}
            key={id}
            onClick={() => onChange(isActive ? "" : id)}
            type="button"
          >
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
