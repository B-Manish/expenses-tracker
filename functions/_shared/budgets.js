import { z } from "zod";
import { currentMonthRangeInKolkata, todayInKolkata } from "./dates.js";
import { badRequest, conflict, notFound } from "./errors.js";
import { MAX_AMOUNT_PAISE, parseRupeesToPaise } from "./money.js";
import { enumSchema, idSchema, validate } from "./validation.js";

export const BUDGET_PERIODS = ["MONTHLY"];

// near at 80%, over at 100%.
const NEAR_THRESHOLD_PERCENT = 80;
const OVER_THRESHOLD_PERCENT = 100;

const SELECT_BUDGET_SQL = `
  SELECT
    b.id,
    b.user_id,
    b.category_id,
    c.name AS category_name,
    c.type AS category_type,
    c.color AS category_color,
    c.icon AS category_icon,
    c.parent_id AS category_parent_id,
    pc.name AS category_parent_name,
    b.amount_paise,
    b.period,
    b.is_active,
    b.created_at,
    b.updated_at
  FROM budgets b
  LEFT JOIN categories c ON c.id = b.category_id
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

function normalizeBudgetBody(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return {
    categoryId: value.categoryId ?? value.category_id,
    amount: value.amount,
    amountPaise: value.amountPaise ?? value.amount_paise,
    period: value.period,
    isActive: value.isActive ?? value.is_active,
  };
}

function parsePaiseInput(input) {
  const value = typeof input === "number" ? String(input) : input;

  if (typeof value !== "string") {
    return { ok: false, message: "Amount paise must be a string or number" };
  }

  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return { ok: false, message: "Amount paise must be a positive integer" };
  }

  if (typeof input === "number" && !Number.isSafeInteger(input)) {
    return { ok: false, message: "Amount paise must be a safe integer" };
  }

  const paise = BigInt(normalized);

  if (paise <= 0n) {
    return { ok: false, message: "Amount must be greater than 0" };
  }

  if (paise > BigInt(MAX_AMOUNT_PAISE)) {
    return { ok: false, message: "Amount is too large" };
  }

  return { ok: true, paise: Number(paise) };
}

function parsePayloadAmount(value) {
  const hasAmount = value.amount !== undefined && value.amount !== null;
  const hasAmountPaise = value.amountPaise !== undefined && value.amountPaise !== null;

  if (hasAmount && hasAmountPaise) {
    return { ok: false, path: ["amount"], message: "Use either amount or amountPaise, not both" };
  }

  if (!hasAmount && !hasAmountPaise) {
    return { ok: false, path: ["amount"], message: "Amount is required" };
  }

  const result = hasAmount
    ? parseRupeesToPaise(value.amount)
    : parsePaiseInput(value.amountPaise);

  return {
    ...result,
    path: hasAmount ? ["amount"] : ["amountPaise"],
  };
}

const budgetPayloadSchema = z.preprocess(
  normalizeBudgetBody,
  z
    .object({
      categoryId: idSchema,
      amount: z.union([z.string(), z.number()]).optional(),
      amountPaise: z.union([z.string(), z.number()]).optional(),
      period: z.preprocess(
        emptyToUndefined,
        enumSchema(BUDGET_PERIODS, "Period").default("MONTHLY"),
      ),
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
      categoryId: value.categoryId,
      amountPaise: parsePayloadAmount(value).paise,
      period: value.period,
      isActive: value.isActive,
    })),
);

export function computeBudgetProgress(amountPaise, spentPaise) {
  const amount = Number(amountPaise) || 0;
  const spent = Math.max(Number(spentPaise) || 0, 0);
  const remainingPaise = amount - spent;
  const ratioPercent = amount > 0 ? (spent / amount) * 100 : 0;
  const percentUsed = Math.round(ratioPercent);
  // Classify on the true ratio so e.g. 99.9% stays "near" rather than rounding to "over".
  let status = "under";

  if (ratioPercent >= OVER_THRESHOLD_PERCENT) {
    status = "over";
  } else if (ratioPercent >= NEAR_THRESHOLD_PERCENT) {
    status = "near";
  }

  return {
    spentPaise: spent,
    remainingPaise,
    percentUsed,
    status,
  };
}

function mapBudgetRow(row, spentPaise = 0) {
  const progress = computeBudgetProgress(row.amount_paise, spentPaise);

  return {
    id: row.id,
    userId: row.user_id,
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
    amountPaise: row.amount_paise,
    period: row.period,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...progress,
  };
}

export function validateBudgetPayload(input) {
  return validate(budgetPayloadSchema, input);
}

export function validateBudgetId(input) {
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
    throw badRequest("Budget category must be an expense category");
  }
}

async function assertNoDuplicateActiveBudget(db, userId, categoryId, period, ignoredId = null) {
  const row = await db
    .prepare(`
      SELECT id
      FROM budgets
      WHERE user_id = ?
        AND category_id = ?
        AND period = ?
        AND is_active = 1
        AND (? IS NULL OR id <> ?)
      LIMIT 1
    `)
    .bind(userId, categoryId, period, ignoredId, ignoredId)
    .first();

  if (row) {
    throw conflict("An active budget already exists for this category");
  }
}

// Current-month spend per category, matching the dashboard: EXPENSE transactions
// month-to-date plus active monthly recurring expenses whose billing day has passed.
async function getCurrentMonthSpendByCategory(db, userId, now) {
  const range = currentMonthRangeInKolkata(now);
  const today = todayInKolkata(now);
  const [year, month, todayDay] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const spendByCategory = new Map();

  function addSpend(categoryId, amountPaise) {
    if (categoryId === null || categoryId === undefined) {
      return;
    }

    spendByCategory.set(
      categoryId,
      (spendByCategory.get(categoryId) ?? 0) + (Number(amountPaise) || 0),
    );
  }

  const transactionRows = await db
    .prepare(`
      SELECT category_id, COALESCE(SUM(amount_paise), 0) AS spent_paise
      FROM transactions
      WHERE user_id = ?
        AND type = 'EXPENSE'
        AND category_id IS NOT NULL
        AND transaction_date BETWEEN ? AND ?
      GROUP BY category_id
    `)
    .bind(userId, range.from, range.to)
    .all();

  for (const row of transactionRows.results || []) {
    addSpend(row.category_id, row.spent_paise);
  }

  const recurringRows = await db
    .prepare(`
      SELECT category_id, amount_paise, billing_day
      FROM recurring_expenses
      WHERE user_id = ?
        AND is_active = 1
        AND frequency = 'MONTHLY'
        AND category_id IS NOT NULL
    `)
    .bind(userId)
    .all();

  for (const row of recurringRows.results || []) {
    const billingDay = Math.min(Number(row.billing_day) || 1, daysInMonth);

    if (billingDay <= todayDay) {
      addSpend(row.category_id, row.amount_paise);
    }
  }

  return spendByCategory;
}

export async function listBudgets(db, userId, options = {}) {
  const now = options.now ?? new Date();
  const spendByCategory = await getCurrentMonthSpendByCategory(db, userId, now);
  const rows = await db
    .prepare(`
      ${SELECT_BUDGET_SQL}
      WHERE b.user_id = ?
      ORDER BY b.is_active DESC, LOWER(c.name) ASC, b.id ASC
    `)
    .bind(userId)
    .all();
  const items = (rows.results || []).map((row) =>
    mapBudgetRow(row, spendByCategory.get(row.category_id) ?? 0),
  );

  return {
    items,
    summary: summarizeBudgets(items),
  };
}

export function summarizeBudgets(items) {
  const active = items.filter((budget) => budget.isActive);

  return {
    totalBudgetedPaise: active.reduce((total, budget) => total + budget.amountPaise, 0),
    totalSpentPaise: active.reduce((total, budget) => total + budget.spentPaise, 0),
    totalRemainingPaise: active.reduce((total, budget) => total + budget.remainingPaise, 0),
    overCount: active.filter((budget) => budget.status === "over").length,
    nearCount: active.filter((budget) => budget.status === "near").length,
    activeCount: active.length,
  };
}

export async function getBudgetById(db, userId, id, options = {}) {
  const row = await db
    .prepare(`${SELECT_BUDGET_SQL} WHERE b.user_id = ? AND b.id = ?`)
    .bind(userId, id)
    .first();

  if (!row) {
    return null;
  }

  const now = options.now ?? new Date();
  const spendByCategory = await getCurrentMonthSpendByCategory(db, userId, now);

  return mapBudgetRow(row, spendByCategory.get(row.category_id) ?? 0);
}

export async function createBudget(db, userId, budget, options = {}) {
  await assertExpenseCategoryExists(db, userId, budget.categoryId);
  await assertNoDuplicateActiveBudget(db, userId, budget.categoryId, budget.period);

  const result = await db
    .prepare(`
      INSERT INTO budgets (user_id, category_id, amount_paise, period, is_active)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(userId, budget.categoryId, budget.amountPaise, budget.period, budget.isActive ? 1 : 0)
    .run();

  const id = result.meta?.last_row_id;

  if (!id) {
    throw badRequest("Budget could not be created");
  }

  return getBudgetById(db, userId, id, options);
}

export async function updateBudget(db, userId, id, budget, options = {}) {
  const existing = await getBudgetById(db, userId, id, options);

  if (!existing) {
    throw notFound("Budget not found");
  }

  await assertExpenseCategoryExists(db, userId, budget.categoryId);

  if (budget.isActive) {
    await assertNoDuplicateActiveBudget(db, userId, budget.categoryId, budget.period, id);
  }

  await db
    .prepare(`
      UPDATE budgets
      SET
        category_id = ?,
        amount_paise = ?,
        period = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND id = ?
    `)
    .bind(budget.categoryId, budget.amountPaise, budget.period, budget.isActive ? 1 : 0, userId, id)
    .run();

  return getBudgetById(db, userId, id, options);
}

export async function deactivateBudget(db, userId, id) {
  const existing = await db
    .prepare("SELECT id FROM budgets WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .first();

  if (!existing) {
    throw notFound("Budget not found");
  }

  await db
    .prepare(`
      UPDATE budgets
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
