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

const KOLKATA_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Kolkata",
  year: "numeric",
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

export function getTodayInKolkata() {
  const parts = KOLKATA_DATE_PARTS_FORMATTER.formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
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
