const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const COMPACT_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Kolkata",
});

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  timeZone: "Asia/Kolkata",
  year: "numeric",
});

const DISPLAY_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const KOLKATA_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Kolkata",
  year: "numeric",
});

const KOLKATA_TIME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00+05:30`)
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDisplayDate(value) {
  const date = parseDate(value);

  if (!date) {
    return "Not set";
  }

  return DISPLAY_DATE_FORMATTER.format(date);
}

export function formatDisplayTime(value) {
  if (typeof value !== "string" || !isValidTimeInput(value)) {
    return "";
  }

  return DISPLAY_TIME_FORMATTER.format(new Date(`2000-01-01T${value}:00+05:30`));
}

export function formatDisplayDateTime(dateValue, timeValue) {
  const dateText = formatDisplayDate(dateValue);
  const timeText = formatDisplayTime(timeValue);

  return timeText ? `${dateText}, ${timeText}` : dateText;
}

export function formatCompactDateLabel(value) {
  const date = parseDate(value);

  if (!date) {
    return "";
  }

  return COMPACT_DATE_FORMATTER.format(date);
}

export function formatMonthLabel(value) {
  const date = parseDate(typeof value === "string" && /^\d{4}-\d{2}$/.test(value)
    ? `${value}-01`
    : value);

  if (!date) {
    return "";
  }

  return MONTH_FORMATTER.format(date);
}

export function isValidDateInput(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidTimeInput(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hour, minute] = value.split(":").map(Number);

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function getTodayInKolkata() {
  const parts = KOLKATA_DATE_PARTS_FORMATTER.formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function getCurrentTimeInKolkata() {
  const parts = KOLKATA_TIME_PARTS_FORMATTER.formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.hour}:${values.minute}`;
}

// Full calendar-month range anchored on the current Kolkata date.
// monthOffset 0 = this month, -1 = last month.
export function getMonthRangeInKolkata(monthOffset = 0) {
  const [year, month] = getTodayInKolkata().split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const targetYear = start.getUTCFullYear();
  const targetMonth = start.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const prefix = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;

  return {
    from: `${prefix}-01`,
    to: `${prefix}-${String(lastDay).padStart(2, "0")}`,
  };
}

// Week-start preference, mirrored into localStorage by the Settings page so
// calendar widgets can read it without an API round trip. date-fns numbering:
// 0 = Sunday … 6 = Saturday.
const WEEK_START_DAYS = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export function getStoredWeekStartsOn() {
  try {
    return WEEK_START_DAYS[localStorage.getItem("weekStartDay")] ?? 1;
  } catch {
    return 1;
  }
}

export function setStoredWeekStartDay(day) {
  try {
    if (day in WEEK_START_DAYS) {
      localStorage.setItem("weekStartDay", day);
    }
  } catch {
    // Persistence is best-effort; calendars fall back to Monday.
  }
}

export function formatDateRange(from, to) {
  if (!from && !to) {
    return "Current month";
  }

  if (from && to) {
    return `${formatDisplayDate(from)} to ${formatDisplayDate(to)}`;
  }

  if (from) {
    return `From ${formatDisplayDate(from)}`;
  }

  return `Until ${formatDisplayDate(to)}`;
}
