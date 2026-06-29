import { z } from "zod";
import { listBudgets } from "./budgets.js";
import {
  addDays,
  currentMonthRangeInKolkata,
  currentWeekRangeInKolkata,
  todayInKolkata,
} from "./dates.js";
import { badRequest } from "./errors.js";
import { dateRangeSchema, validate } from "./validation.js";

const DEFAULT_WEEK_START_DAY = "MONDAY";
const RECENT_TRANSACTION_LIMIT = 5;
const DEFAULT_CATEGORY_COLOR = "#64748b";
const VALID_WEEK_START_DAYS = new Set([
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
]);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeStatsQuery(input) {
  const value = input instanceof URLSearchParams
    ? Object.fromEntries(input.entries())
    : input;

  if (!isPlainObject(value)) {
    return {};
  }

  return {
    from: value.from,
    to: value.to,
  };
}

const statsQuerySchema = z.preprocess(normalizeStatsQuery, dateRangeSchema());

function toInteger(value) {
  return Number(value ?? 0);
}

function dateToUtcMs(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return Date.UTC(year, month - 1, day);
}

function countInclusiveDays(from, to) {
  return Math.floor((dateToUtcMs(to) - dateToUtcMs(from)) / MS_PER_DAY) + 1;
}

function monthString(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function endOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function occurrenceDateForMonth(year, month, billingDay) {
  const day = Math.min(billingDay, endOfMonth(year, month));

  return `${monthString(year, month)}-${String(day).padStart(2, "0")}`;
}

function startOfMonth(dateString) {
  return `${dateString.slice(0, 7)}-01`;
}

function resolveSelectedRange(query, now) {
  const today = todayInKolkata(now);

  if (query.from && query.to) {
    return {
      from: query.from,
      to: query.to,
    };
  }

  if (query.from) {
    return {
      from: query.from,
      to: query.from > today ? query.from : today,
    };
  }

  if (query.to) {
    return {
      from: startOfMonth(query.to),
      to: query.to,
    };
  }

  return currentMonthRangeInKolkata(now);
}

function resolveDailyTrendRange(query, selectedRange, now) {
  if (query.from || query.to) {
    return selectedRange;
  }

  const today = todayInKolkata(now);

  return {
    from: addDays(today, -6),
    to: today,
  };
}

function assertRangeOrder(range) {
  if (range.from > range.to) {
    throw badRequest("From date must be before or equal to to date");
  }
}

async function getWeekStartDay(db, userId) {
  const row = await db
    .prepare("SELECT value FROM settings WHERE user_id = ? AND key = ?")
    .bind(userId, "week_start_day")
    .first();
  const value = typeof row?.value === "string"
    ? row.value.trim().toUpperCase()
    : DEFAULT_WEEK_START_DAY;

  return VALID_WEEK_START_DAYS.has(value) ? value : DEFAULT_WEEK_START_DAY;
}

async function sumExpensesForRange(db, userId, range) {
  const row = await db
    .prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) AS total_paise
      FROM transactions
      WHERE user_id = ?
        AND type = 'EXPENSE'
        AND transaction_date BETWEEN ? AND ?
    `)
    .bind(userId, range.from, range.to)
    .first();

  return toInteger(row?.total_paise);
}

async function getActiveRecurringExpenses(db, userId) {
  const rows = await db
    .prepare(`
      SELECT
        re.id,
        re.title,
        re.amount_paise,
        re.category_id,
        c.name AS category_name,
        pc.name AS category_parent_name,
        c.color AS category_color,
        re.billing_day
      FROM recurring_expenses re
      LEFT JOIN categories c ON c.id = re.category_id
      LEFT JOIN categories pc ON pc.id = c.parent_id
      WHERE re.user_id = ?
        AND re.is_active = 1
        AND re.frequency = 'MONTHLY'
      ORDER BY re.billing_day ASC, LOWER(re.title) ASC, re.id ASC
    `)
    .bind(userId)
    .all();

  return (rows.results || []).map((row) => ({
    id: row.id,
    title: row.title,
    amountPaise: toInteger(row.amount_paise),
    categoryId: row.category_id,
    categoryName: row.category_parent_name
      ? `${row.category_parent_name} / ${row.category_name}`
      : row.category_name ?? "Uncategorized",
    categoryColor: row.category_color ?? DEFAULT_CATEGORY_COLOR,
    billingDay: toInteger(row.billing_day),
  }));
}

function getRecurringOccurrencesForRange(recurringExpenses, range) {
  const fromYear = Number(range.from.slice(0, 4));
  const fromMonth = Number(range.from.slice(5, 7));
  const toYear = Number(range.to.slice(0, 4));
  const toMonth = Number(range.to.slice(5, 7));
  const occurrences = [];

  for (
    let year = fromYear, month = fromMonth;
    year < toYear || (year === toYear && month <= toMonth);
    month += 1
  ) {
    if (month > 12) {
      year += 1;
      month = 1;
    }

    for (const expense of recurringExpenses) {
      const date = occurrenceDateForMonth(year, month, expense.billingDay);

      if (date >= range.from && date <= range.to) {
        occurrences.push({
          ...expense,
          date,
        });
      }
    }
  }

  return occurrences;
}

function sumRecurringOccurrences(recurringExpenses, range) {
  return getRecurringOccurrencesForRange(recurringExpenses, range)
    .reduce((total, expense) => total + expense.amountPaise, 0);
}

async function getSelectedPeriodTotals(db, userId, range) {
  const row = await db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount_paise ELSE 0 END), 0)
          AS total_income_paise,
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount_paise ELSE 0 END), 0)
          AS total_expense_paise,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE user_id = ?
        AND transaction_date BETWEEN ? AND ?
    `)
    .bind(userId, range.from, range.to)
    .first();
  const totalIncomePaise = toInteger(row?.total_income_paise);
  const totalExpensePaise = toInteger(row?.total_expense_paise);

  return {
    totalIncomePaise,
    totalExpensePaise,
    netBalancePaise: totalIncomePaise - totalExpensePaise,
    transactionCount: toInteger(row?.transaction_count),
  };
}

async function getBiggestExpense(db, userId, range) {
  const row = await db
    .prepare(`
      SELECT
        t.id,
        t.title,
        t.amount_paise,
        t.transaction_date,
        t.transaction_time,
        c.name AS category_name,
        pc.name AS category_parent_name
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN categories pc ON pc.id = c.parent_id
      WHERE t.user_id = ?
        AND t.type = 'EXPENSE'
        AND t.transaction_date BETWEEN ? AND ?
      ORDER BY t.amount_paise DESC, t.transaction_date DESC, t.transaction_time DESC, t.created_at DESC, t.id DESC
      LIMIT 1
    `)
    .bind(userId, range.from, range.to)
    .first();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    amountPaise: toInteger(row.amount_paise),
    transactionDate: row.transaction_date,
    transactionTime: row.transaction_time,
    categoryName: row.category_parent_name
      ? `${row.category_parent_name} / ${row.category_name}`
      : row.category_name ?? null,
  };
}

function getBiggestRecurringExpense(recurringExpenses, range) {
  const biggest = getRecurringOccurrencesForRange(recurringExpenses, range)
    .sort((first, second) => (
      second.amountPaise - first.amountPaise ||
      second.date.localeCompare(first.date) ||
      first.title.localeCompare(second.title)
    ))[0];

  if (!biggest) {
    return null;
  }

  return {
    id: biggest.id,
    title: biggest.title,
    amountPaise: biggest.amountPaise,
    transactionDate: biggest.date,
    transactionTime: biggest.transactionTime,
    categoryName: biggest.categoryName,
    source: "RECURRING",
  };
}

async function getMostUsedCategory(db, userId, range) {
  const row = await db
    .prepare(`
      SELECT
        CASE
          WHEN c.id IS NULL THEN 'Uncategorized'
          WHEN pc.name IS NOT NULL THEN pc.name || ' / ' || c.name
          ELSE c.name
        END AS category,
        c.color AS color,
        COUNT(*) AS count
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN categories pc ON pc.id = c.parent_id
      WHERE t.user_id = ?
        AND t.type = 'EXPENSE'
        AND t.transaction_date BETWEEN ? AND ?
      GROUP BY c.id, c.name, pc.name, c.color
      ORDER BY count DESC, SUM(t.amount_paise) DESC, category ASC
      LIMIT 1
    `)
    .bind(userId, range.from, range.to)
    .first();

  if (!row) {
    return null;
  }

  return {
    category: row.category,
    count: toInteger(row.count),
    color: row.color ?? DEFAULT_CATEGORY_COLOR,
  };
}

function getMostUsedRecurringCategory(recurringExpenses, range) {
  const counts = new Map();

  for (const expense of getRecurringOccurrencesForRange(recurringExpenses, range)) {
    const key = expense.categoryId ?? "uncategorized";
    const current = counts.get(key) || {
      category: expense.categoryName,
      color: expense.categoryColor,
      count: 0,
      amountPaise: 0,
    };

    current.count += 1;
    current.amountPaise += expense.amountPaise;
    counts.set(key, current);
  }

  return Array.from(counts.values())
    .sort((first, second) => (
      second.count - first.count ||
      second.amountPaise - first.amountPaise ||
      first.category.localeCompare(second.category)
    ))[0] || null;
}

async function getCategoryBreakdown(db, userId, range) {
  const rows = await db
    .prepare(`
      SELECT
        CASE
          WHEN c.id IS NULL THEN 'Uncategorized'
          WHEN pc.name IS NOT NULL THEN pc.name || ' / ' || c.name
          ELSE c.name
        END AS category,
        c.color AS color,
        COALESCE(SUM(t.amount_paise), 0) AS amount_paise
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN categories pc ON pc.id = c.parent_id
      WHERE t.user_id = ?
        AND t.type = 'EXPENSE'
        AND t.transaction_date BETWEEN ? AND ?
      GROUP BY c.id, c.name, pc.name, c.color
      ORDER BY amount_paise DESC, category ASC
    `)
    .bind(userId, range.from, range.to)
    .all();

  return (rows.results || []).map((row) => ({
    category: row.category,
    amountPaise: toInteger(row.amount_paise),
    color: row.color ?? DEFAULT_CATEGORY_COLOR,
  }));
}

function mergeRecurringCategoryBreakdown(categoryBreakdown, recurringExpenses, range) {
  const byCategory = new Map(
    categoryBreakdown.map((item) => [item.category, { ...item }]),
  );

  for (const expense of getRecurringOccurrencesForRange(recurringExpenses, range)) {
    const current = byCategory.get(expense.categoryName) || {
      category: expense.categoryName,
      amountPaise: 0,
      color: expense.categoryColor,
    };

    current.amountPaise += expense.amountPaise;
    current.color = current.color || expense.categoryColor;
    byCategory.set(expense.categoryName, current);
  }

  return Array.from(byCategory.values())
    .sort((first, second) => (
      second.amountPaise - first.amountPaise ||
      first.category.localeCompare(second.category)
    ));
}

async function getDailyTrend(db, userId, range) {
  const rows = await db
    .prepare(`
      SELECT
        transaction_date AS date,
        COALESCE(SUM(amount_paise), 0) AS amount_paise
      FROM transactions
      WHERE user_id = ?
        AND type = 'EXPENSE'
        AND transaction_date BETWEEN ? AND ?
      GROUP BY transaction_date
      ORDER BY transaction_date ASC
    `)
    .bind(userId, range.from, range.to)
    .all();
  const amountByDate = new Map(
    (rows.results || []).map((row) => [row.date, toInteger(row.amount_paise)]),
  );
  const trend = [];

  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    trend.push({
      date,
      amountPaise: amountByDate.get(date) ?? 0,
    });
  }

  return trend;
}

function mergeRecurringDailyTrend(dailyTrend, recurringExpenses, range) {
  const amountByDate = new Map(
    dailyTrend.map((item) => [item.date, item.amountPaise]),
  );

  for (const expense of getRecurringOccurrencesForRange(recurringExpenses, range)) {
    amountByDate.set(expense.date, (amountByDate.get(expense.date) ?? 0) + expense.amountPaise);
  }

  return dailyTrend.map((item) => ({
    ...item,
    amountPaise: amountByDate.get(item.date) ?? 0,
  }));
}

async function getMonthlyTrend(db, userId, year) {
  const rows = await db
    .prepare(`
      SELECT
        SUBSTR(transaction_date, 1, 7) AS month,
        COALESCE(SUM(amount_paise), 0) AS amount_paise
      FROM transactions
      WHERE user_id = ?
        AND type = 'EXPENSE'
        AND transaction_date BETWEEN ? AND ?
      GROUP BY SUBSTR(transaction_date, 1, 7)
      ORDER BY month ASC
    `)
    .bind(userId, `${year}-01-01`, `${year}-12-31`)
    .all();
  const amountByMonth = new Map(
    (rows.results || []).map((row) => [row.month, toInteger(row.amount_paise)]),
  );

  return Array.from({ length: 12 }, (_, index) => {
    const month = monthString(year, index + 1);

    return {
      month,
      amountPaise: amountByMonth.get(month) ?? 0,
    };
  });
}

function mergeRecurringMonthlyTrend(monthlyTrend, recurringExpenses) {
  const monthlyRecurringPaise = recurringExpenses.reduce(
    (total, expense) => total + expense.amountPaise,
    0,
  );

  return monthlyTrend.map((item) => ({
    ...item,
    amountPaise: item.amountPaise + monthlyRecurringPaise,
  }));
}

function mapRecentTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    amountPaise: row.amount_paise === null ? null : toInteger(row.amount_paise),
    categoryId: row.category_id ?? null,
    categoryName: row.category_parent_name
      ? `${row.category_parent_name} / ${row.category_name}`
      : row.category_name ?? null,
    categoryColor: row.category_color ?? null,
    paymentMethodId: row.payment_method_id ?? null,
    paymentMethodName: row.payment_method_name ?? null,
    transactionDate: row.transaction_date,
    transactionTime: row.transaction_time,
    merchant: row.merchant,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getRecentTransactions(db, userId) {
  const rows = await db
    .prepare(`
      SELECT
        t.id,
        t.type,
        t.title,
        t.amount_paise,
        t.category_id,
        c.name AS category_name,
        pc.name AS category_parent_name,
        c.color AS category_color,
        t.payment_method_id,
        pm.name AS payment_method_name,
        t.transaction_date,
        t.transaction_time,
        t.merchant,
        t.notes,
        t.created_at,
        t.updated_at
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN categories pc ON pc.id = c.parent_id
      LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
      WHERE t.user_id = ?
      ORDER BY t.transaction_date DESC, t.transaction_time DESC, t.created_at DESC, t.id DESC
      LIMIT ?
    `)
    .bind(userId, RECENT_TRANSACTION_LIMIT)
    .all();

  return (rows.results || []).map(mapRecentTransaction);
}

export function validateStatsQuery(input) {
  return validate(statsQuerySchema, input);
}

export async function getDashboardStats(db, query, options = {}) {
  const userId = options.userId ?? "phone:9949055750";
  const now = options.now ?? new Date();
  const today = todayInKolkata(now);
  const weekStartDay = await getWeekStartDay(db, userId);
  const todayRange = {
    from: today,
    to: today,
  };
  const weekRange = currentWeekRangeInKolkata(now, weekStartDay);
  const monthRange = currentMonthRangeInKolkata(now);
  const selectedRange = resolveSelectedRange(query, now);
  const dailyTrendRange = resolveDailyTrendRange(query, selectedRange, now);
  const currentYear = Number(today.slice(0, 4));

  assertRangeOrder(selectedRange);
  assertRangeOrder(dailyTrendRange);

  const recurringExpenses = await getActiveRecurringExpenses(db, userId);
  const recurringOccurrences = getRecurringOccurrencesForRange(recurringExpenses, selectedRange);
  const totalMonthlyRecurringPaise = recurringExpenses.reduce(
    (total, expense) => total + expense.amountPaise,
    0,
  );
  const todaySpentPaise = await sumExpensesForRange(db, userId, todayRange) +
    sumRecurringOccurrences(recurringExpenses, todayRange);
  const weekSpentPaise = await sumExpensesForRange(db, userId, weekRange) +
    sumRecurringOccurrences(recurringExpenses, weekRange);
  const monthSpentPaise = await sumExpensesForRange(db, userId, monthRange) +
    sumRecurringOccurrences(recurringExpenses, monthRange);
  const totals = await getSelectedPeriodTotals(db, userId, selectedRange);
  const selectedRecurringPaise = recurringOccurrences
    .reduce((total, expense) => total + expense.amountPaise, 0);
  const totalExpensePaise = totals.totalExpensePaise + selectedRecurringPaise;
  const dayCount = Math.max(countInclusiveDays(selectedRange.from, selectedRange.to), 1);
  const biggestExpense = [
    await getBiggestExpense(db, userId, selectedRange),
    getBiggestRecurringExpense(recurringExpenses, selectedRange),
  ]
    .filter(Boolean)
    .sort((first, second) => second.amountPaise - first.amountPaise)[0] || null;
  const mostUsedCategory = [
    await getMostUsedCategory(db, userId, selectedRange),
    getMostUsedRecurringCategory(recurringExpenses, selectedRange),
  ]
    .filter(Boolean)
    .sort((first, second) => (
      second.count - first.count ||
      first.category.localeCompare(second.category)
    ))[0] || null;
  const categoryBreakdown = mergeRecurringCategoryBreakdown(
    await getCategoryBreakdown(db, userId, selectedRange),
    recurringExpenses,
    selectedRange,
  );
  const dailyTrend = mergeRecurringDailyTrend(
    await getDailyTrend(db, userId, dailyTrendRange),
    recurringExpenses,
    dailyTrendRange,
  );
  const monthlyTrend = mergeRecurringMonthlyTrend(
    await getMonthlyTrend(db, userId, currentYear),
    recurringExpenses,
  );
  const recentTransactions = await getRecentTransactions(db, userId);
  const budgetData = await listBudgets(db, userId, { now });
  const budgets = {
    items: budgetData.items.filter((budget) => budget.isActive),
    summary: budgetData.summary,
  };

  return {
    todaySpentPaise,
    weekSpentPaise,
    monthSpentPaise,
    totalMonthlyRecurringPaise,
    selectedRecurringPaise,
    totalIncomePaise: totals.totalIncomePaise,
    totalExpensePaise,
    netBalancePaise: totals.totalIncomePaise - totalExpensePaise,
    averageDailySpendPaise: Math.round(totalExpensePaise / dayCount),
    transactionCount: totals.transactionCount + recurringOccurrences.length,
    biggestExpense,
    mostUsedCategory,
    categoryBreakdown,
    dailyTrend,
    monthlyTrend,
    recurringExpenses: recurringExpenses.map((expense) => ({
      id: expense.id,
      title: expense.title,
      amountPaise: expense.amountPaise,
      categoryId: expense.categoryId,
      categoryName: expense.categoryName,
      categoryColor: expense.categoryColor,
      billingDay: expense.billingDay,
    })),
    recentTransactions,
    budgets,
  };
}
