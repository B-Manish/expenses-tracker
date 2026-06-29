import { z } from "zod";
import { badRequest, notFound } from "./errors.js";
import { MAX_AMOUNT_PAISE, parseRupeesToPaise } from "./money.js";
import {
  enumSchema,
  idSchema,
  stringSchema,
  validate,
} from "./validation.js";

export const RECURRING_FREQUENCIES = ["MONTHLY"];

const SELECT_RECURRING_EXPENSE_SQL = `
  SELECT
    re.id,
    re.user_id,
    re.title,
    re.amount_paise,
    re.category_id,
    c.name AS category_name,
    c.type AS category_type,
    c.color AS category_color,
    c.icon AS category_icon,
    c.parent_id AS category_parent_id,
    pc.name AS category_parent_name,
    re.billing_day,
    re.frequency,
    re.notes,
    re.is_active,
    re.created_at,
    re.updated_at
  FROM recurring_expenses re
  LEFT JOIN categories c ON c.id = re.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
`;

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function optionalStringSchema(label, max) {
  return z
    .preprocess(
      emptyToUndefined,
      z.string().trim().max(max, `${label} must be ${max} characters or less`).optional(),
    )
    .transform((value) => value ?? null);
}

function normalizeRecurringExpenseBody(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return {
    title: value.title ?? value.name,
    amount: value.amount,
    amountPaise: value.amountPaise ?? value.amount_paise,
    categoryId: value.categoryId ?? value.category_id,
    billingDay: value.billingDay ?? value.dueDay ?? value.billing_day ?? value.due_day,
    frequency: value.frequency,
    notes: value.notes ?? value.description,
    isActive: value.isActive ?? value.is_active,
  };
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

const recurringExpensePayloadSchema = z
  .preprocess(
    normalizeRecurringExpenseBody,
    z
      .object({
        title: stringSchema("Name", { max: 120 }),
        amount: z.union([z.string(), z.number()]).optional(),
        amountPaise: z.union([z.string(), z.number()]).optional(),
        categoryId: idSchema,
        billingDay: z.coerce
          .number()
          .int("Billing day must be an integer")
          .min(1, "Billing day must be between 1 and 31")
          .max(31, "Billing day must be between 1 and 31"),
        frequency: z.preprocess(
          emptyToUndefined,
          enumSchema(RECURRING_FREQUENCIES, "Frequency").default("MONTHLY"),
        ),
        notes: optionalStringSchema("Notes", 1000),
        isActive: z.preprocess(emptyToUndefined, z.coerce.boolean().default(true)),
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
        title: value.title,
        amountPaise: parsePayloadAmount(value).paise,
        categoryId: value.categoryId,
        billingDay: value.billingDay,
        frequency: value.frequency,
        notes: value.notes,
        isActive: value.isActive,
      })),
  );

function mapRecurringExpenseRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    name: row.title,
    amountPaise: row.amount_paise,
    categoryId: row.category_id,
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
    billingDay: row.billing_day,
    dueDay: row.billing_day,
    frequency: row.frequency,
    notes: row.notes,
    description: row.notes,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateRecurringExpensePayload(input) {
  return validate(recurringExpensePayloadSchema, input);
}

export function validateRecurringExpenseId(input) {
  return validate(idSchema, input);
}

async function assertExpenseCategoryExists(db, userId, categoryId) {
  const category = await db
    .prepare("SELECT id, type FROM categories WHERE user_id = ? AND id = ?")
    .bind(userId, categoryId)
    .first();

  if (!category) {
    throw badRequest("Category does not exist");
  }

  if (category.type !== "EXPENSE") {
    throw badRequest("Recurring expense category must be an expense category");
  }
}

export async function listRecurringExpenses(db, userId) {
  const rows = await db
    .prepare(`
      ${SELECT_RECURRING_EXPENSE_SQL}
      WHERE re.user_id = ?
      ORDER BY re.is_active DESC, re.billing_day ASC, LOWER(re.title) ASC, re.id ASC
    `)
    .bind(userId)
    .all();

  return {
    items: (rows.results || []).map(mapRecurringExpenseRow),
  };
}

export async function getRecurringExpenseById(db, userId, id) {
  const row = await db
    .prepare(`${SELECT_RECURRING_EXPENSE_SQL} WHERE re.user_id = ? AND re.id = ?`)
    .bind(userId, id)
    .first();

  return row ? mapRecurringExpenseRow(row) : null;
}

export async function createRecurringExpense(db, userId, recurringExpense) {
  await assertExpenseCategoryExists(db, userId, recurringExpense.categoryId);

  const result = await db
    .prepare(`
      INSERT INTO recurring_expenses (
        user_id,
        title,
        amount_paise,
        category_id,
        billing_day,
        frequency,
        notes,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      userId,
      recurringExpense.title,
      recurringExpense.amountPaise,
      recurringExpense.categoryId,
      recurringExpense.billingDay,
      recurringExpense.frequency,
      recurringExpense.notes,
      recurringExpense.isActive ? 1 : 0,
    )
    .run();

  const id = result.meta?.last_row_id;

  if (!id) {
    throw badRequest("Recurring expense could not be created");
  }

  return getRecurringExpenseById(db, userId, id);
}

export async function updateRecurringExpense(db, userId, id, recurringExpense) {
  const existing = await getRecurringExpenseById(db, userId, id);

  if (!existing) {
    throw notFound("Recurring expense not found");
  }

  await assertExpenseCategoryExists(db, userId, recurringExpense.categoryId);
  await db
    .prepare(`
      UPDATE recurring_expenses
      SET
        title = ?,
        amount_paise = ?,
        category_id = ?,
        billing_day = ?,
        frequency = ?,
        notes = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND id = ?
    `)
    .bind(
      recurringExpense.title,
      recurringExpense.amountPaise,
      recurringExpense.categoryId,
      recurringExpense.billingDay,
      recurringExpense.frequency,
      recurringExpense.notes,
      recurringExpense.isActive ? 1 : 0,
      userId,
      id,
    )
    .run();

  return getRecurringExpenseById(db, userId, id);
}

export async function deactivateRecurringExpense(db, userId, id) {
  const existing = await getRecurringExpenseById(db, userId, id);

  if (!existing) {
    throw notFound("Recurring expense not found");
  }

  await db
    .prepare(`
      UPDATE recurring_expenses
      SET is_active = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND id = ?
    `)
    .bind(userId, id)
    .run();

  return {
    deactivated: true,
  };
}
