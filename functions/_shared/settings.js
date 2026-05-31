import { z } from "zod";
import { badRequest } from "./errors.js";
import { enumSchema, validate } from "./validation.js";

const SETTINGS_KEYS = ["currency", "theme", "week_start_day", "timezone"];
const WEEK_START_DAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

const DEFAULT_SETTINGS = Object.freeze({
  currency: "INR",
  theme: "system",
  week_start_day: "MONDAY",
  timezone: "Asia/Kolkata",
});

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeUpperString(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

function normalizeLowerString(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

function normalizeTimezone(value) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeSettingsPayload(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return {
    currency: value.currency,
    theme: value.theme,
    weekStartDay: value.weekStartDay ?? value.week_start_day,
    timezone: value.timezone,
  };
}

const settingsPayloadSchema = z.preprocess(
  normalizeSettingsPayload,
  z
    .object({
      currency: z.preprocess(
        normalizeUpperString,
        enumSchema(["INR"], "Currency").optional(),
      ),
      theme: z.preprocess(
        normalizeLowerString,
        enumSchema(["system", "light", "dark"], "Theme").optional(),
      ),
      weekStartDay: z.preprocess(
        normalizeUpperString,
        enumSchema(WEEK_START_DAYS, "Week start day").optional(),
      ),
      timezone: z.preprocess(
        normalizeTimezone,
        enumSchema(["Asia/Kolkata"], "Timezone").optional(),
      ),
    })
    .superRefine((settings, context) => {
      if (!Object.values(settings).some((value) => value !== undefined)) {
        context.addIssue({
          code: "custom",
          message: "At least one setting must be provided",
        });
      }
    }),
);

function mapSettingKeyToClientKey(key) {
  return key === "week_start_day" ? "weekStartDay" : key;
}

function mapPayloadToRows(settings) {
  return [
    ["currency", settings.currency],
    ["theme", settings.theme],
    ["week_start_day", settings.weekStartDay],
    ["timezone", settings.timezone],
  ].filter(([, value]) => value !== undefined);
}

function normalizeStoredValue(key, value) {
  const fallback = DEFAULT_SETTINGS[key];

  if (typeof value !== "string") {
    return fallback;
  }

  if (key === "currency") {
    const normalized = value.trim().toUpperCase();

    return normalized === "INR" ? normalized : fallback;
  }

  if (key === "theme") {
    const normalized = value.trim().toLowerCase();

    return ["system", "light", "dark"].includes(normalized) ? normalized : fallback;
  }

  if (key === "week_start_day") {
    const normalized = value.trim().toUpperCase();

    return WEEK_START_DAYS.includes(normalized) ? normalized : fallback;
  }

  if (key === "timezone") {
    const normalized = value.trim();

    return normalized === "Asia/Kolkata" ? normalized : fallback;
  }

  return fallback;
}

async function ensureDefaultSettings(db) {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db
      .prepare(`
        INSERT OR IGNORE INTO settings (key, value)
        VALUES (?, ?)
      `)
      .bind(key, value)
      .run();
  }
}

function mapSettingsRows(rows) {
  const byKey = new Map((rows || []).map((row) => [row.key, row]));
  const result = {};

  for (const key of SETTINGS_KEYS) {
    const row = byKey.get(key);
    const clientKey = mapSettingKeyToClientKey(key);

    result[clientKey] = normalizeStoredValue(key, row?.value);
  }

  return result;
}

export function validateSettingsPayload(input) {
  return validate(settingsPayloadSchema, input);
}

export async function getSettings(db) {
  await ensureDefaultSettings(db);

  const rows = await db
    .prepare(`
      SELECT key, value, updated_at
      FROM settings
      WHERE key IN (?, ?, ?, ?)
    `)
    .bind(...SETTINGS_KEYS)
    .all();

  return mapSettingsRows(rows.results || []);
}

export async function updateSettings(db, settings) {
  const rows = mapPayloadToRows(settings);

  if (!rows.length) {
    throw badRequest("At least one setting must be provided");
  }

  for (const [key, value] of rows) {
    await db
      .prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(key, value)
      .run();
  }

  return getSettings(db);
}
