import { z } from "zod";
import { notFound } from "./errors.js";
import {
  enumSchema,
  idSchema,
  paginationSchema,
  validate,
} from "./validation.js";

const STATUS_FILTERS = ["all", "needs_review", "confirmed"];
const STATUS_BY_FILTER = Object.freeze({
  needs_review: "PENDING",
  confirmed: "CONFIRMED",
});

const SELECT_SMS_IMPORT_SQL = `
  SELECT
    si.id,
    si.sender,
    si.raw_message,
    si.amount_paise,
    si.currency,
    si.merchant,
    si.direction,
    si.suggested_type,
    si.transaction_date,
    si.transaction_time,
    si.transaction_at,
    si.payment_rail,
    si.status,
    si.reviewed_at,
    si.created_at,
    t.id AS transaction_id,
    t.title AS transaction_title,
    t.type AS transaction_type,
    c.name AS category_name,
    pc.name AS category_parent_name,
    pm.name AS payment_method_name
  FROM sms_imports si
  LEFT JOIN transactions t
    ON t.sms_import_id = si.id AND t.user_id = si.user_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
  LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
`;

function emptyToUndefined(value) {
  return value === "" || value === null ? undefined : value;
}

function normalizeQueryParams(input) {
  const value = input instanceof URLSearchParams
    ? Object.fromEntries(input.entries())
    : input;

  if (!value || typeof value !== "object") {
    return {};
  }

  return {
    status: value.status,
    limit: value.limit,
    offset: value.offset,
  };
}

const smsImportQuerySchema = z.preprocess(
  normalizeQueryParams,
  paginationSchema.merge(
    z.object({
      status: z.preprocess(
        emptyToUndefined,
        enumSchema(STATUS_FILTERS, "Status").default("all"),
      ),
    }),
  ),
);

// High: amount and merchant present. Medium: amount present, merchant weak/missing.
// Low: amount missing/unrecognized (null) — needs review, not zero.
export function deriveConfidence(amountPaise, merchant) {
  if (amountPaise === null || amountPaise === undefined) {
    return "LOW";
  }

  return merchant && String(merchant).trim() ? "HIGH" : "MEDIUM";
}

export function validateSmsImportQuery(input) {
  return validate(smsImportQuerySchema, input);
}

export function validateSmsImportId(input) {
  return validate(idSchema, input);
}

function mapSmsImportRow(row) {
  return {
    id: row.id,
    sender: row.sender,
    rawMessage: row.raw_message ?? null,
    amountPaise: row.amount_paise ?? null,
    currency: row.currency ?? "INR",
    merchant: row.merchant ?? null,
    direction: row.direction,
    suggestedType: row.suggested_type,
    transactionDate: row.transaction_date,
    transactionTime: row.transaction_time,
    transactionAt: row.transaction_at,
    paymentRail: row.payment_rail,
    status: row.status,
    reviewedAt: row.reviewed_at ?? null,
    createdAt: row.created_at,
    confidence: deriveConfidence(row.amount_paise, row.merchant),
    transactionId: row.transaction_id ?? null,
    title:
      row.transaction_title ??
      row.merchant ??
      `SMS transaction from ${row.sender}`,
    categoryName: row.category_parent_name
      ? `${row.category_parent_name} / ${row.category_name}`
      : row.category_name ?? null,
    paymentMethodName: row.payment_method_name ?? null,
  };
}

function buildFilter(userId, statusFilter) {
  const conditions = ["si.user_id = ?"];
  const bindings = [userId];
  const status = STATUS_BY_FILTER[statusFilter];

  if (status) {
    conditions.push("si.status = ?");
    bindings.push(status);
  }

  return {
    whereSql: `WHERE ${conditions.join(" AND ")}`,
    bindings,
  };
}

export async function listSmsImports(db, userId, query) {
  const { whereSql, bindings } = buildFilter(userId, query.status);
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM sms_imports si ${whereSql}`)
    .bind(...bindings)
    .first();
  const rows = await db
    .prepare(`
      ${SELECT_SMS_IMPORT_SQL}
      ${whereSql}
      ORDER BY si.transaction_date DESC, si.transaction_time DESC, si.id DESC
      LIMIT ? OFFSET ?
    `)
    .bind(...bindings, query.limit, query.offset)
    .all();

  return {
    items: (rows.results || []).map(mapSmsImportRow),
    total: countRow?.total ?? 0,
    limit: query.limit,
    offset: query.offset,
  };
}

async function getSmsImportRow(db, userId, id) {
  return db
    .prepare(`${SELECT_SMS_IMPORT_SQL} WHERE si.user_id = ? AND si.id = ?`)
    .bind(userId, id)
    .first();
}

export async function confirmSmsImport(db, userId, id) {
  const existing = await getSmsImportRow(db, userId, id);

  if (!existing) {
    throw notFound("SMS import not found");
  }

  await db
    .prepare(`
      UPDATE sms_imports
      SET status = 'CONFIRMED',
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND id = ?
    `)
    .bind(userId, id)
    .run();

  return mapSmsImportRow(await getSmsImportRow(db, userId, id));
}
