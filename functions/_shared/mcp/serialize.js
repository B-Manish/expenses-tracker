import { badRequest } from "../errors.js";

const PAISE_SUFFIX = "Paise";

export function toRupeesView(value) {
  if (Array.isArray(value)) {
    return value.map(toRupeesView);
  }

  if (value && typeof value === "object") {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (key.endsWith(PAISE_SUFFIX) && typeof item === "number") {
        output[key.slice(0, -PAISE_SUFFIX.length)] = Math.round(item) / 100;
      } else {
        output[key] = toRupeesView(item);
      }
    }

    return output;
  }

  return value;
}

function isNumericId(ref) {
  return typeof ref === "number" || /^\d+$/.test(String(ref).trim());
}

async function resolveRef(db, userId, ref, table, label) {
  if (ref === undefined || ref === null || String(ref).trim() === "") {
    return null;
  }

  if (isNumericId(ref)) {
    return Number(ref);
  }

  const name = String(ref).trim();
  const row = await db
    .prepare(`SELECT id FROM ${table} WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1`)
    .bind(userId, name)
    .first();

  if (!row) {
    throw badRequest(`Unknown ${label}: ${name}`);
  }

  return row.id;
}

export function resolveCategoryRef(db, userId, ref) {
  return resolveRef(db, userId, ref, "categories", "category");
}

export function resolvePaymentMethodRef(db, userId, ref) {
  return resolveRef(db, userId, ref, "payment_methods", "payment method");
}
