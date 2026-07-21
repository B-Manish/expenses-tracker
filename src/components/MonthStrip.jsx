import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, addWeeks, format, isSameDay, parseISO, startOfWeek } from "date-fns";
import { useState } from "react";
import { cn } from "../lib/utils.js";
import { getStoredWeekStartsOn } from "../utils/dateUtils.js";

// Single-week calendar card: month label with prev/next week arrows, weekday
// header row, selected day as a primary pill. The arrows only browse weeks;
// they never change the selection. Clicking a day selects it, and clicking the
// already-selected day clears the selection when onClear is provided. An empty
// value renders no highlighted day.
export default function MonthStrip({ className, disabled = false, onChange, onClear, value }) {
  const selected = value ? parseISO(value) : null;
  const [cursor, setCursor] = useState(() => selected || new Date());
  const [lastValue, setLastValue] = useState(value);

  // Follow external selection changes (a filter applied elsewhere, an edited
  // transaction loading) so the visible week always contains the selection.
  // Render-time state adjustment per react.dev "adjusting state when props
  // change" — no effect, no extra paint.
  if (value !== lastValue) {
    setLastValue(value);

    if (value) {
      setCursor(parseISO(value));
    }
  }

  const weekStart = startOfWeek(cursor, { weekStartsOn: getStoredWeekStartsOn() });
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <div className={cn("rounded-3xl border border-border/60 bg-card p-4 shadow-sm", className)}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          className="icon-button rounded-full"
          disabled={disabled}
          onClick={() => setCursor((current) => addWeeks(current, -1))}
          aria-label="Previous week"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="text-sm font-bold text-foreground">
          {format(cursor, "MMMM yyyy")}
        </span>
        <button
          type="button"
          className="icon-button rounded-full"
          disabled={disabled}
          onClick={() => setCursor((current) => addWeeks(current, 1))}
          aria-label="Next week"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((day) => {
          const isActive = selected ? isSameDay(day, selected) : false;
          const inMonth = day.getMonth() === cursor.getMonth();

          return (
            <button
              type="button"
              key={day.toISOString()}
              disabled={disabled}
              onClick={() => {
                if (isActive && onClear) {
                  onClear();
                } else {
                  onChange(format(day, "yyyy-MM-dd"));
                }
              }}
              aria-label={format(day, "d MMMM yyyy")}
              aria-pressed={isActive}
              className="grid justify-items-center gap-2 rounded-xl border-0 bg-transparent px-0 py-1"
            >
              <span
                className={cn(
                  "text-xs font-semibold",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {format(day, "EEEEEE")}
              </span>
              <span
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-lg text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : inMonth
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground/60 hover:bg-muted",
                )}
              >
                {format(day, "d")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
