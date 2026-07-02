import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, addWeeks, format, isSameDay, parseISO, startOfWeek } from "date-fns";
import { cn } from "../lib/utils.js";

// Single-week calendar card from the reference design: month label with
// prev/next arrows, Mo-Su header row, selected day as a blue pill.
// ponytail: arrows move one week (not one month) — a month jump would skip the
// three weeks in between; switch to addMonths if month paging is ever wanted.
export default function MonthStrip({ value, onChange, className }) {
  const selected = value ? parseISO(value) : new Date();
  const weekStart = startOfWeek(selected, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  function shiftWeek(direction) {
    onChange(format(addWeeks(selected, direction), "yyyy-MM-dd"));
  }

  return (
    <div className={cn("rounded-3xl border border-border/60 bg-card p-4 shadow-sm", className)}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          className="icon-button rounded-full"
          onClick={() => shiftWeek(-1)}
          aria-label="Previous week"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="text-sm font-bold text-foreground">
          {format(selected, "MMMM - yyyy")}
        </span>
        <button
          type="button"
          className="icon-button rounded-full"
          onClick={() => shiftWeek(1)}
          aria-label="Next week"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((day) => {
          const isActive = isSameDay(day, selected);
          const inMonth = day.getMonth() === selected.getMonth();

          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => onChange(format(day, "yyyy-MM-dd"))}
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
