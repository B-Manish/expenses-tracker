import { z } from "zod";
import { badRequest, notFound } from "./errors.js";
import { MAX_AMOUNT_PAISE, paiseToRupeesString, parseRupeesToPaise } from "./money.js";
import {
  dateSchema,
  enumSchema,
  idSchema,
  paginationSchema,
  stringSchema,
  validate,
} from "./validation.js";

const TRANSACTION_TYPES = ["EXPENSE", "INCOME"];
const TRANSACTION_FILTER_TYPES = ["ALL", ...TRANSACTION_TYPES];
const TRANSACTION_SOURCES = ["MANUAL", "SMS"];
const TRANSACTION_FILTER_SOURCES = ["ALL", ...TRANSACTION_SOURCES];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const FILTER_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const DEFAULT_SORT = "transaction_date_desc";
const SORT_CLAUSES = Object.freeze({
  transaction_date_desc:
    "t.transaction_date DESC, t.transaction_time DESC, t.created_at DESC, t.id DESC",
  transaction_date_asc: "t.transaction_date ASC, t.transaction_time ASC, t.created_at ASC, t.id ASC",
  created_at_desc: "t.created_at DESC, t.id DESC",
  created_at_asc: "t.created_at ASC, t.id ASC",
  // NULL amounts (unparsed SMS imports) sort after real amounts either way.
  amount_desc: "t.amount_paise IS NULL ASC, t.amount_paise DESC, t.id DESC",
  amount_asc: "t.amount_paise IS NULL ASC, t.amount_paise ASC, t.id ASC",
});
export const TRANSACTION_SORTS = Object.freeze(Object.keys(SORT_CLAUSES));

const SELECT_TRANSACTION_SQL = `
  SELECT
    t.id,
    t.type,
    t.title,
    t.amount_paise,
    t.category_id,
    c.name AS category_name,
    c.type AS category_type,
    c.color AS category_color,
    c.icon AS category_icon,
    c.parent_id AS category_parent_id,
    pc.name AS category_parent_name,
    t.payment_method_id,
    pm.name AS payment_method_name,
    t.transaction_date,
    t.transaction_time,
    t.merchant,
    t.notes,
    t.source,
    t.sms_import_id,
    t.created_at,
    t.updated_at
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
  LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
`;

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function emptyToNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
}

function emptyToUndefined(value) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}

function optionalIdSchema() {
  return z
    .preprocess(emptyToNull, idSchema.nullable())
    .transform((value) => value ?? null);
}

function optionalStringSchema(label, max) {
  return z
    .preprocess(
      emptyToUndefined,
      z.string().trim().max(max, `${label} must be ${max} characters or less`).optional(),
    )
    .transform((value) => value ?? null);
}

function optionalQueryIdSchema() {
  return z
    .preprocess(emptyToUndefined, idSchema.optional())
    .transform((value) => value ?? null);
}

// Filter amounts are inclusive bounds in rupees; 0 means "no bound" and is
// stored as null. Output is integer paise to match the money representation.
function optionalAmountPaiseSchema(label) {
  return z
    .preprocess(emptyToUndefined, z.union([z.string(), z.number()]).optional())
    .transform((value, context) => {
      if (value === undefined) {
        return null;
      }

      const normalized = (typeof value === "number" ? String(value) : value).trim();

      if (!FILTER_AMOUNT_PATTERN.test(normalized)) {
        context.addIssue({
          code: "custom",
          message: `${label} must be an amount with up to 2 decimal places`,
        });

        return z.NEVER;
      }

      const [rupees, paise = ""] = normalized.split(".");
      const totalPaise = BigInt(rupees) * 100n + BigInt(paise.padEnd(2, "0") || "0");

      if (totalPaise === 0n) {
        return null;
      }

      if (totalPaise > BigInt(MAX_AMOUNT_PAISE)) {
        context.addIssue({ code: "custom", message: `${label} is too large` });

        return z.NEVER;
      }

      return Number(totalPaise);
    });
}

function flagSchema() {
  return z
    .preprocess(emptyToUndefined, z.union([z.boolean(), z.string()]).optional())
    .transform((value) => flagToBoolean(value));
}

// Single source of truth for the filter fields, shared by the list query
// schema (with pagination) and the saved-view filter schema (without).
function filterFieldShape() {
  return {
    type: z.preprocess(
      emptyToUndefined,
      enumSchema(TRANSACTION_FILTER_TYPES, "Type").default("ALL"),
    ),
    categoryId: optionalQueryIdSchema(),
    uncategorized: flagSchema(),
    paymentMethodId: optionalQueryIdSchema(),
    from: z.preprocess(emptyToUndefined, dateSchema.optional()),
    to: z.preprocess(emptyToUndefined, dateSchema.optional()),
    search: z
      .preprocess(
        emptyToUndefined,
        z.string().trim().max(120, "Search must be 120 characters or less").optional(),
      )
      .transform((value) => value ?? null),
    source: z.preprocess(
      emptyToUndefined,
      enumSchema(TRANSACTION_FILTER_SOURCES, "Source").default("ALL"),
    ),
    minAmount: optionalAmountPaiseSchema("Minimum amount"),
    maxAmount: optionalAmountPaiseSchema("Maximum amount"),
    sort: z.preprocess(emptyToUndefined, z.enum(TRANSACTION_SORTS).default(DEFAULT_SORT)),
  };
}

function refineFilters(value, context) {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({
      code: "custom",
      path: ["from"],
      message: "From date must be before or equal to to date",
    });
  }

  if (
    value.minAmount !== null &&
    value.maxAmount !== null &&
    value.minAmount > value.maxAmount
  ) {
    context.addIssue({
      code: "custom",
      path: ["minAmount"],
      message: "Minimum amount must be less than or equal to maximum amount",
    });
  }
}

// minAmount/maxAmount are output as integer paise; rename for clarity downstream.
function toQueryShape(value) {
  return {
    ...value,
    minAmountPaise: value.minAmount,
    maxAmountPaise: value.maxAmount,
  };
}

function normalizeTransactionBody(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return {
    type: value.type,
    title: value.title,
    amount: value.amount,
    amountPaise: value.amountPaise ?? value.amount_paise,
    categoryId: value.categoryId ?? value.category_id,
    paymentMethodId: value.paymentMethodId ?? value.payment_method_id,
    transactionDate: value.transactionDate ?? value.transaction_date,
    transactionTime: value.transactionTime ?? value.transaction_time,
    merchant: value.merchant,
    notes: value.notes,
  };
}

function normalizeFilterParams(input) {
  const value = input instanceof URLSearchParams
    ? Object.fromEntries(input.entries())
    : input;

  if (!isPlainObject(value)) {
    return {};
  }

  return {
    type: value.type,
    categoryId: value.categoryId ?? value.category_id,
    uncategorized: value.uncategorized,
    paymentMethodId: value.paymentMethodId ?? value.payment_method_id,
    from: value.from,
    to: value.to,
    search: value.search,
    source: value.source,
    minAmount: value.minAmount ?? value.min_amount,
    maxAmount: value.maxAmount ?? value.max_amount,
    sort: value.sort,
  };
}

function normalizeQueryParams(input) {
  const value = input instanceof URLSearchParams
    ? Object.fromEntries(input.entries())
    : input;

  return {
    ...normalizeFilterParams(value),
    limit: isPlainObject(value) ? value.limit : undefined,
    offset: isPlainObject(value) ? value.offset : undefined,
  };
}

function flagToBoolean(value) {
  return value === true || value === "true" || value === "1";
}

function parsePaiseInput(input) {
  const value = typeof input === "number" ? String(input) : input;

  if (typeof value !== "string") {
    return {
      ok: false,
      message: "Amount paise must be a string or number",
    };
  }

  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return {
      ok: false,
      message: "Amount paise must be a positive integer",
    };
  }

  if (typeof input === "number" && !Number.isSafeInteger(input)) {
    return {
      ok: false,
      message: "Amount paise must be a safe integer",
    };
  }

  const paise = BigInt(normalized);

  if (paise <= 0n) {
    return {
      ok: false,
      message: "Amount must be greater than 0",
    };
  }

  if (paise > BigInt(MAX_AMOUNT_PAISE)) {
    return {
      ok: false,
      message: "Amount is too large",
    };
  }

  return {
    ok: true,
    paise: Number(paise),
  };
}

function parsePayloadAmount(value) {
  const hasAmount = value.amount !== undefined && value.amount !== null;
  const hasAmountPaise = value.amountPaise !== undefined && value.amountPaise !== null;

  if (hasAmount && hasAmountPaise) {
    return {
      ok: false,
      path: ["amount"],
      message: "Use either amount or amountPaise, not both",
    };
  }

  if (!hasAmount && !hasAmountPaise) {
    return {
      ok: false,
      path: ["amount"],
      message: "Amount is required",
    };
  }

  const result = hasAmount
    ? parseRupeesToPaise(value.amount)
    : parsePaiseInput(value.amountPaise);

  return {
    ...result,
    path: hasAmount ? ["amount"] : ["amountPaise"],
  };
}

const transactionPayloadSchema = z
  .preprocess(
    normalizeTransactionBody,
    z
      .object({
        type: enumSchema(TRANSACTION_TYPES, "Type"),
        title: stringSchema("Title", { max: 120 }),
        amount: z.union([z.string(), z.number()]).optional(),
        amountPaise: z.union([z.string(), z.number()]).optional(),
        categoryId: optionalIdSchema(),
        paymentMethodId: optionalIdSchema(),
        transactionDate: dateSchema,
        transactionTime: z.string().trim().regex(TIME_PATTERN, "Time must be in HH:mm format"),
        merchant: optionalStringSchema("Merchant", 120),
        notes: optionalStringSchema("Notes", 1000),
      })
      .superRefine((value, context) => {
        const amount = parsePayloadAmount(value);

        if (!amount.ok) {
          context.addIssue({
            code: "custom",
            path: amount.path,
            message: amount.message,
          });
        }
      })
      .transform((value) => ({
        type: value.type,
        title: value.title,
        amountPaise: parsePayloadAmount(value).paise,
        categoryId: value.categoryId,
        paymentMethodId: value.paymentMethodId,
        transactionDate: value.transactionDate,
        transactionTime: value.transactionTime,
        merchant: value.merchant,
        notes: value.notes,
      })),
  );

const transactionQuerySchema = z
  .preprocess(
    normalizeQueryParams,
    paginationSchema
      .merge(z.object(filterFieldShape()))
      .superRefine(refineFilters)
      .transform(toQueryShape),
  );

// Filter-only schema (no pagination), reused to validate saved-view filters.
const transactionFilterSchema = z
  .preprocess(
    normalizeFilterParams,
    z.object(filterFieldShape()).superRefine(refineFilters).transform(toQueryShape),
  );

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function mapTransactionRow(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    amountPaise: row.amount_paise,
    categoryId: row.category_id ?? null,
    categoryName: row.category_parent_name
      ? `${row.category_parent_name} / ${row.category_name}`
      : row.category_name ?? null,
    category: row.category_id
      ? {
          id: row.category_id,
          name: row.category_name,
          type: row.category_type,
          color: row.category_color,
          icon: row.category_icon,
          parentId: row.category_parent_id ?? null,
          parentName: row.category_parent_name ?? null,
        }
      : null,
    paymentMethodId: row.payment_method_id ?? null,
    paymentMethodName: row.payment_method_name ?? null,
    paymentMethod: row.payment_method_id
      ? {
          id: row.payment_method_id,
          name: row.payment_method_name,
        }
      : null,
    transactionDate: row.transaction_date,
    transactionTime: row.transaction_time,
    merchant: row.merchant,
    notes: row.notes,
    source: row.source ?? "MANUAL",
    smsImportId: row.sms_import_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildTransactionFilters(query) {
  const conditions = ["t.user_id = ?"];
  const bindings = [query.userId];

  if (query.type !== "ALL") {
    conditions.push("t.type = ?");
    bindings.push(query.type);
  }

  if (query.source !== "ALL") {
    conditions.push("t.source = ?");
    bindings.push(query.source);
  }

  if (query.uncategorized) {
    conditions.push("t.category_id IS NULL");
  } else if (query.categoryId !== null) {
    conditions.push(`
      t.category_id IN (
        SELECT id FROM categories WHERE user_id = ? AND (id = ? OR parent_id = ?)
      )
    `);
    bindings.push(query.userId, query.categoryId, query.categoryId);
  }

  if (query.paymentMethodId !== null) {
    conditions.push("t.payment_method_id = ?");
    bindings.push(query.paymentMethodId);
  }

  if (query.minAmountPaise !== null && query.minAmountPaise !== undefined) {
    conditions.push("t.amount_paise >= ?");
    bindings.push(query.minAmountPaise);
  }

  if (query.maxAmountPaise !== null && query.maxAmountPaise !== undefined) {
    conditions.push("t.amount_paise <= ?");
    bindings.push(query.maxAmountPaise);
  }

  if (query.from) {
    conditions.push("t.transaction_date >= ?");
    bindings.push(query.from);
  }

  if (query.to) {
    conditions.push("t.transaction_date <= ?");
    bindings.push(query.to);
  }

  if (query.search) {
    const search = `%${escapeLike(query.search.toLowerCase())}%`;

    conditions.push(`(
      LOWER(t.title) LIKE ? ESCAPE '\\'
      OR LOWER(COALESCE(t.merchant, '')) LIKE ? ESCAPE '\\'
      OR LOWER(COALESCE(t.notes, '')) LIKE ? ESCAPE '\\'
    )`);
    bindings.push(search, search, search);
  }

  return {
    whereSql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    bindings,
  };
}

export function validateTransactionPayload(input) {
  return validate(transactionPayloadSchema, input);
}

export function validateTransactionQuery(input) {
  return validate(transactionQuerySchema, input);
}

export function validateTransactionId(input) {
  return validate(idSchema, input);
}

export function validateTransactionFilters(input) {
  return validate(transactionFilterSchema, input);
}

// Canonical, serializable filter object for storage in a saved view. Keys
// mirror the URL/query parameter names so the client can apply them directly.
export function serializeSavedViewFilters(input) {
  const result = validateTransactionFilters(input);

  if (!result.ok) {
    return result;
  }

  const data = result.data;

  return {
    ok: true,
    data: {
      type: data.type,
      source: data.source,
      categoryId: data.categoryId === null ? "" : String(data.categoryId),
      uncategorized: data.uncategorized ? "true" : "",
      paymentMethodId: data.paymentMethodId === null ? "" : String(data.paymentMethodId),
      from: data.from ?? "",
      to: data.to ?? "",
      search: data.search ?? "",
      minAmount: data.minAmountPaise === null ? "" : paiseToRupeesString(data.minAmountPaise),
      maxAmount: data.maxAmountPaise === null ? "" : paiseToRupeesString(data.maxAmountPaise),
      sort: data.sort,
    },
  };
}

export async function getTransactionById(db, userId, id) {
  const row = await db
    .prepare(`${SELECT_TRANSACTION_SQL} WHERE t.user_id = ? AND t.id = ?`)
    .bind(userId, id)
    .first();

  return row ? mapTransactionRow(row) : null;
}

async function assertCategoryMatchesTransactionType(db, userId, transaction) {
  if (transaction.categoryId === null) {
    return;
  }

  const category = await db
    .prepare("SELECT id, type FROM categories WHERE user_id = ? AND id = ?")
    .bind(userId, transaction.categoryId)
    .first();

  if (!category) {
    throw badRequest("Category does not exist");
  }

  if (category.type !== transaction.type) {
    throw badRequest("Category type must match transaction type");
  }
}

async function assertPaymentMethodExists(db, userId, transaction) {
  if (transaction.paymentMethodId === null) {
    return;
  }

  const paymentMethod = await db
    .prepare("SELECT id FROM payment_methods WHERE user_id = ? AND id = ?")
    .bind(userId, transaction.paymentMethodId)
    .first();

  if (!paymentMethod) {
    throw badRequest("Payment method does not exist");
  }
}

async function assertTransactionReferences(db, userId, transaction) {
  await assertCategoryMatchesTransactionType(db, userId, transaction);
  await assertPaymentMethodExists(db, userId, transaction);
}

export async function listTransactions(db, userId, query) {
  const { whereSql, bindings } = buildTransactionFilters({ ...query, userId });
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM transactions t ${whereSql}`)
    .bind(...bindings)
    .first();
  const rows = await db
    .prepare(`
      ${SELECT_TRANSACTION_SQL}
      ${whereSql}
      ORDER BY ${SORT_CLAUSES[query.sort]}
      LIMIT ? OFFSET ?
    `)
    .bind(...bindings, query.limit, query.offset)
    .all();

  return {
    items: (rows.results || []).map(mapTransactionRow),
    total: countRow?.total ?? 0,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function createTransaction(db, userId, transaction) {
  await assertTransactionReferences(db, userId, transaction);

  const result = await db
    .prepare(`
      INSERT INTO transactions (
        user_id,
        type,
        title,
        amount_paise,
        category_id,
        payment_method_id,
        transaction_date,
        transaction_time,
        merchant,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      userId,
      transaction.type,
      transaction.title,
      transaction.amountPaise,
      transaction.categoryId,
      transaction.paymentMethodId,
      transaction.transactionDate,
      transaction.transactionTime,
      transaction.merchant,
      transaction.notes,
    )
    .run();

  const id = result.meta?.last_row_id;

  if (!id) {
    throw badRequest("Transaction could not be created");
  }

  return getTransactionById(db, userId, id);
}

export async function updateTransaction(db, userId, id, transaction) {
  const existing = await getTransactionById(db, userId, id);

  if (!existing) {
    throw notFound("Transaction not found");
  }

  await assertTransactionReferences(db, userId, transaction);
  await db
    .prepare(`
      UPDATE transactions
      SET
        type = ?,
        title = ?,
        amount_paise = ?,
        category_id = ?,
        payment_method_id = ?,
        transaction_date = ?,
        transaction_time = ?,
        merchant = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND id = ?
    `)
    .bind(
      transaction.type,
      transaction.title,
      transaction.amountPaise,
      transaction.categoryId,
      transaction.paymentMethodId,
      transaction.transactionDate,
      transaction.transactionTime,
      transaction.merchant,
      transaction.notes,
      userId,
      id,
    )
    .run();

  return getTransactionById(db, userId, id);
}

export async function deleteTransaction(db, userId, id) {
  const existing = await getTransactionById(db, userId, id);

  if (!existing) {
    throw notFound("Transaction not found");
  }

  await db.prepare("DELETE FROM transactions WHERE user_id = ? AND id = ?").bind(userId, id).run();

  if (existing.smsImportId !== null) {
    await db
      .prepare("DELETE FROM sms_imports WHERE user_id = ? AND id = ?")
      .bind(userId, existing.smsImportId)
      .run();
  }

  return {
    deleted: true,
    smsImportDeleted: existing.smsImportId !== null,
  };
}
