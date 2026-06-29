import assert from "node:assert/strict";
import test from "node:test";
import {
  computeBudgetProgress,
  createBudget,
  deactivateBudget,
  getBudgetById,
  listBudgets,
  updateBudget,
  validateBudgetPayload,
} from "../functions/_shared/budgets.js";

const USER_ID = "phone:9949055750";
const OTHER_USER_ID = "phone:1111111111";
// Mid-month so recurring billed on/before the 15th counts; June has 30 days.
const NOW = new Date("2026-06-15T12:00:00+05:30");

// Minimal in-memory D1 stand-in. Dispatches on the SQL the helper emits.
class MemoryDb {
  constructor(seed = {}) {
    this.categories = seed.categories || [];
    this.budgets = seed.budgets || [];
    this.transactions = seed.transactions || [];
    this.recurringExpenses = seed.recurringExpenses || [];
    this.nextBudgetId = this.budgets.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  }

  category(id) {
    return this.categories.find((row) => row.id === id) || null;
  }

  budgetRow(row) {
    const category = this.category(row.category_id);
    const parent = category?.parent_id ? this.category(category.parent_id) : null;

    return {
      id: row.id,
      user_id: row.user_id,
      category_id: row.category_id,
      category_name: category?.name ?? null,
      category_type: category?.type ?? null,
      category_color: category?.color ?? null,
      category_icon: category?.icon ?? null,
      category_parent_id: category?.parent_id ?? null,
      category_parent_name: parent?.name ?? null,
      amount_paise: row.amount_paise,
      period: row.period,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  prepare(sql) {
    const db = this;

    return {
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async first() {
        if (sql.includes("FROM budgets b")) {
          const [userId, id] = this.values;
          const row = db.budgets.find((b) => b.user_id === userId && b.id === id);
          return row ? db.budgetRow(row) : null;
        }

        if (sql.includes("FROM budgets")) {
          if (sql.includes("is_active = 1")) {
            const [userId, categoryId, period, ignoredId] = this.values;
            const row = db.budgets.find((b) =>
              b.user_id === userId &&
              b.category_id === categoryId &&
              b.period === period &&
              b.is_active === 1 &&
              (ignoredId === null || b.id !== ignoredId),
            );
            return row ? { id: row.id } : null;
          }

          const [userId, id] = this.values;
          const row = db.budgets.find((b) => b.user_id === userId && b.id === id);
          return row ? { id: row.id } : null;
        }

        if (sql.includes("FROM categories")) {
          const [userId, id] = this.values;
          const category = db.category(id);
          return category && category.user_id === userId
            ? { id: category.id, type: category.type }
            : null;
        }

        throw new Error(`Unexpected first() query: ${sql}`);
      },
      async all() {
        if (sql.includes("FROM budgets b")) {
          const [userId] = this.values;
          const rows = db.budgets
            .filter((b) => b.user_id === userId)
            .map((b) => db.budgetRow(b));
          return { results: rows };
        }

        if (sql.includes("FROM transactions")) {
          const [userId, from, to] = this.values;
          const byCategory = new Map();
          for (const txn of db.transactions) {
            if (
              txn.user_id === userId &&
              txn.type === "EXPENSE" &&
              txn.category_id != null &&
              txn.transaction_date >= from &&
              txn.transaction_date <= to
            ) {
              byCategory.set(
                txn.category_id,
                (byCategory.get(txn.category_id) ?? 0) + txn.amount_paise,
              );
            }
          }
          return {
            results: Array.from(byCategory.entries()).map(([category_id, spent_paise]) => ({
              category_id,
              spent_paise,
            })),
          };
        }

        if (sql.includes("FROM recurring_expenses")) {
          const [userId] = this.values;
          return {
            results: db.recurringExpenses
              .filter((row) =>
                row.user_id === userId &&
                row.is_active === 1 &&
                row.frequency === "MONTHLY" &&
                row.category_id != null,
              )
              .map((row) => ({
                category_id: row.category_id,
                amount_paise: row.amount_paise,
                billing_day: row.billing_day,
              })),
          };
        }

        throw new Error(`Unexpected all() query: ${sql}`);
      },
      async run() {
        if (sql.includes("INTO budgets")) {
          const [userId, categoryId, amountPaise, period, isActive] = this.values;
          const id = db.nextBudgetId++;
          db.budgets.push({
            id,
            user_id: userId,
            category_id: categoryId,
            amount_paise: amountPaise,
            period,
            is_active: isActive,
            created_at: "2026-06-15 06:30:00",
            updated_at: "2026-06-15 06:30:00",
          });
          return { meta: { last_row_id: id, changes: 1 } };
        }

        if (sql.includes("is_active = 0")) {
          const [userId, id] = this.values;
          const row = db.budgets.find((b) => b.user_id === userId && b.id === id);
          if (row) row.is_active = 0;
          return { meta: { changes: row ? 1 : 0 } };
        }

        if (sql.includes("UPDATE budgets")) {
          const [categoryId, amountPaise, period, isActive, userId, id] = this.values;
          const row = db.budgets.find((b) => b.user_id === userId && b.id === id);
          if (row) {
            row.category_id = categoryId;
            row.amount_paise = amountPaise;
            row.period = period;
            row.is_active = isActive;
          }
          return { meta: { changes: row ? 1 : 0 } };
        }

        throw new Error(`Unexpected run() query: ${sql}`);
      },
    };
  }
}

function expenseCategory(overrides = {}) {
  return {
    id: 1,
    user_id: USER_ID,
    name: "Food",
    type: "EXPENSE",
    color: "#ef4444",
    icon: null,
    parent_id: null,
    ...overrides,
  };
}

test("validateBudgetPayload accepts rupee amounts and rejects non-positive", () => {
  const ok = validateBudgetPayload({ categoryId: 1, amount: "5000" });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.amountPaise, 500000);
  assert.equal(ok.data.period, "MONTHLY");
  assert.equal(ok.data.isActive, true);

  assert.equal(validateBudgetPayload({ categoryId: 1, amount: "0" }).ok, false);
  assert.equal(validateBudgetPayload({ amount: "10" }).ok, false);
});

test("computeBudgetProgress classifies under/near/over", () => {
  assert.equal(computeBudgetProgress(1000, 700).status, "under");
  assert.equal(computeBudgetProgress(1000, 800).status, "near");
  assert.equal(computeBudgetProgress(1000, 999).status, "near");
  assert.equal(computeBudgetProgress(1000, 1000).status, "over");
  const over = computeBudgetProgress(1000, 1200);
  assert.equal(over.status, "over");
  assert.equal(over.percentUsed, 120);
  assert.equal(over.remainingPaise, -200);
});

test("createBudget inserts an active monthly budget for an expense category", async () => {
  const db = new MemoryDb({ categories: [expenseCategory()] });
  const budget = await createBudget(
    db,
    USER_ID,
    { categoryId: 1, amountPaise: 500000, period: "MONTHLY", isActive: true },
    { now: NOW },
  );

  assert.equal(db.budgets.length, 1);
  assert.equal(db.budgets[0].user_id, USER_ID);
  assert.equal(budget.amountPaise, 500000);
  assert.equal(budget.categoryName, "Food");
  assert.equal(budget.status, "under");
  assert.equal(budget.spentPaise, 0);
});

test("createBudget rejects non-expense and missing categories", async () => {
  const incomeDb = new MemoryDb({ categories: [expenseCategory({ type: "INCOME" })] });
  await assert.rejects(
    () => createBudget(incomeDb, USER_ID, { categoryId: 1, amountPaise: 1000, period: "MONTHLY", isActive: true }, { now: NOW }),
    /expense category/,
  );

  const emptyDb = new MemoryDb({ categories: [] });
  await assert.rejects(
    () => createBudget(emptyDb, USER_ID, { categoryId: 1, amountPaise: 1000, period: "MONTHLY", isActive: true }, { now: NOW }),
    /Category does not exist/,
  );
});

test("createBudget prevents a duplicate active budget for the same category", async () => {
  const db = new MemoryDb({
    categories: [expenseCategory()],
    budgets: [{
      id: 1,
      user_id: USER_ID,
      category_id: 1,
      amount_paise: 100000,
      period: "MONTHLY",
      is_active: 1,
      created_at: "2026-06-01 00:00:00",
      updated_at: "2026-06-01 00:00:00",
    }],
  });

  await assert.rejects(
    () => createBudget(db, USER_ID, { categoryId: 1, amountPaise: 200000, period: "MONTHLY", isActive: true }, { now: NOW }),
    /already exists/,
  );
  assert.equal(db.budgets.length, 1);
});

test("listBudgets reports spend from transactions and recurring expenses", async () => {
  const db = new MemoryDb({
    categories: [expenseCategory()],
    budgets: [{
      id: 1,
      user_id: USER_ID,
      category_id: 1,
      amount_paise: 100000,
      period: "MONTHLY",
      is_active: 1,
      created_at: "2026-06-01 00:00:00",
      updated_at: "2026-06-01 00:00:00",
    }],
    transactions: [
      { user_id: USER_ID, type: "EXPENSE", category_id: 1, amount_paise: 80000, transaction_date: "2026-06-10" },
      { user_id: USER_ID, type: "EXPENSE", category_id: 1, amount_paise: 5000, transaction_date: "2026-05-30" }, // last month, excluded
      { user_id: USER_ID, type: "INCOME", category_id: 1, amount_paise: 999, transaction_date: "2026-06-10" }, // income, excluded
    ],
    recurringExpenses: [
      { user_id: USER_ID, category_id: 1, amount_paise: 10000, billing_day: 10, frequency: "MONTHLY", is_active: 1 },
      { user_id: USER_ID, category_id: 1, amount_paise: 7000, billing_day: 25, frequency: "MONTHLY", is_active: 1 }, // not billed by 15th
    ],
  });

  const result = await listBudgets(db, USER_ID, { now: NOW });
  const budget = result.items[0];

  assert.equal(budget.spentPaise, 90000); // 80000 txns + 10000 recurring billed by 15th
  assert.equal(budget.remainingPaise, 10000);
  assert.equal(budget.percentUsed, 90);
  assert.equal(budget.status, "near");
  assert.equal(result.summary.totalBudgetedPaise, 100000);
  assert.equal(result.summary.totalSpentPaise, 90000);
  assert.equal(result.summary.nearCount, 1);
});

test("updateBudget changes the amount and re-derives progress", async () => {
  const db = new MemoryDb({
    categories: [expenseCategory()],
    budgets: [{
      id: 1,
      user_id: USER_ID,
      category_id: 1,
      amount_paise: 100000,
      period: "MONTHLY",
      is_active: 1,
      created_at: "2026-06-01 00:00:00",
      updated_at: "2026-06-01 00:00:00",
    }],
    transactions: [
      { user_id: USER_ID, type: "EXPENSE", category_id: 1, amount_paise: 50000, transaction_date: "2026-06-10" },
    ],
  });

  const updated = await updateBudget(
    db,
    USER_ID,
    1,
    { categoryId: 1, amountPaise: 50000, period: "MONTHLY", isActive: true },
    { now: NOW },
  );

  assert.equal(db.budgets[0].amount_paise, 50000);
  assert.equal(updated.amountPaise, 50000);
  assert.equal(updated.spentPaise, 50000);
  assert.equal(updated.status, "over"); // 100%
});

test("deactivateBudget soft-deactivates instead of deleting", async () => {
  const db = new MemoryDb({
    categories: [expenseCategory()],
    budgets: [{
      id: 1,
      user_id: USER_ID,
      category_id: 1,
      amount_paise: 100000,
      period: "MONTHLY",
      is_active: 1,
      created_at: "2026-06-01 00:00:00",
      updated_at: "2026-06-01 00:00:00",
    }],
  });

  const result = await deactivateBudget(db, USER_ID, 1);

  assert.deepEqual(result, { deactivated: true });
  assert.equal(db.budgets.length, 1);
  assert.equal(db.budgets[0].is_active, 0);
});

test("budgets are isolated per user", async () => {
  const db = new MemoryDb({
    categories: [expenseCategory()],
    budgets: [{
      id: 1,
      user_id: USER_ID,
      category_id: 1,
      amount_paise: 100000,
      period: "MONTHLY",
      is_active: 1,
      created_at: "2026-06-01 00:00:00",
      updated_at: "2026-06-01 00:00:00",
    }],
  });

  // Another user cannot read this budget.
  assert.equal(await getBudgetById(db, OTHER_USER_ID, 1, { now: NOW }), null);

  // Another user's list is empty.
  const otherList = await listBudgets(db, OTHER_USER_ID, { now: NOW });
  assert.equal(otherList.items.length, 0);

  // Another user cannot deactivate it.
  await assert.rejects(() => deactivateBudget(db, OTHER_USER_ID, 1), /not found/);
  assert.equal(db.budgets[0].is_active, 1);
});
