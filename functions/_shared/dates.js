import { badRequest } from "./errors.js";

export const APP_TIME_ZONE = "Asia/Kolkata";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_DAYS = Object.freeze({
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
});

function parseDateParts(dateString) {
  const match = DATE_PATTERN.exec(dateString);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatDateParts(year, month, day) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

export function isValidDateString(value) {
  if (typeof value !== "string") {
    return false;
  }

  const parts = parseDateParts(value);

  if (!parts) {
    return false;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day
  );
}

export function compareDateStrings(first, second) {
  if (!isValidDateString(first) || !isValidDateString(second)) {
    throw badRequest("Dates must use valid YYYY-MM-DD values");
  }

  return first.localeCompare(second);
}

export function validateInclusiveDateRange(from, to) {
  const issues = [];

  if (from && !isValidDateString(from)) {
    issues.push({
      path: ["from"],
      message: "Date must be a valid YYYY-MM-DD date",
    });
  }

  if (to && !isValidDateString(to)) {
    issues.push({
      path: ["to"],
      message: "Date must be a valid YYYY-MM-DD date",
    });
  }

  if (!issues.length && from && to && from > to) {
    issues.push({
      path: ["from"],
      message: "From date must be before or equal to to date",
    });
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function assertInclusiveDateRange(from, to) {
  const result = validateInclusiveDateRange(from, to);

  if (!result.ok) {
    throw badRequest(result.issues.map((issue) => issue.message).join("; "));
  }

  return {
    from,
    to,
  };
}

export function getKolkataDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    weekday: lookup.weekday,
  };
}

export function todayInKolkata(date = new Date()) {
  const parts = getKolkataDateParts(date);

  return formatDateParts(parts.year, parts.month, parts.day);
}

export function addDays(dateString, days) {
  if (!isValidDateString(dateString)) {
    throw badRequest("Date must be a valid YYYY-MM-DD date");
  }

  const parts = parseDateParts(dateString);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  date.setUTCDate(date.getUTCDate() + days);

  return formatDateParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function startOfWeekInKolkata(
  date = new Date(),
  weekStartDay = "MONDAY",
) {
  const today = todayInKolkata(date);
  const dayName = weekStartDay.toUpperCase();
  const startDay = WEEK_DAYS[dayName] ?? WEEK_DAYS.MONDAY;
  const parts = parseDateParts(today);
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const currentDay = utcDate.getUTCDay();
  const daysSinceStart = (currentDay - startDay + 7) % 7;

  return addDays(today, -daysSinceStart);
}

export function currentWeekRangeInKolkata(
  date = new Date(),
  weekStartDay = "MONDAY",
) {
  const from = startOfWeekInKolkata(date, weekStartDay);

  return {
    from,
    to: todayInKolkata(date),
  };
}

export function currentMonthRangeInKolkata(date = new Date()) {
  const today = todayInKolkata(date);
  const parts = parseDateParts(today);

  return {
    from: formatDateParts(parts.year, parts.month, 1),
    to: today,
  };
}

