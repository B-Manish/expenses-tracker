import { z } from "zod";
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

async function getWeekStartDay(db) {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind("week_start_day")
    .first();
  const value = typeof row?.value === "string"
    ? row.value.trim().toUpperCase()
    : DEFAULT_WEEK_START_DAY;

  return VALID_WEEK_START_DAYS.has(value) ? value : DEFAULT_WEEK_START_DAY;
}

async function sumExpensesForRange(db, range) {
  const row = await db
    .prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) AS total_paise
      FROM transactions
      WHERE type = 'EXPENSE'
        AND transaction_date BETWEEN ? AND ?
    `)
    .bind(range.from, range.to)
    .first();

  return toInteger(row?.total_paise);
}

async function getSelectedPeriodTotals(db, range) {
  const row = await db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount_paise ELSE 0 END), 0)
          AS total_income_paise,
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount_paise ELSE 0 END), 0)
          AS total_expense_paise,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE transaction_date BETWEEN ? AND ?
    `)
    .bind(range.from, range.to)
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

async function getBiggestExpense(db, range) {
  const row = await db
    .prepare(`
      SELECT
        t.id,
        t.title,
        t.amount_paise,
        t.transaction_date,
        c.name AS category_name
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'EXPENSE'
        AND t.transaction_date BETWEEN ? AND ?
      ORDER BY t.amount_paise DESC, t.transaction_date DESC, t.created_at DESC, t.id DESC
      LIMIT 1
    `)
    .bind(range.from, range.to)
    .first();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    amountPaise: toInteger(row.amount_paise),
    transactionDate: row.transaction_date,
    categoryName: row.category_name ?? null,
  };
}

async function getMostUsedCategory(db, range) {
  const row = await db
    .prepare(`
      SELECT
        COALESCE(c.name, 'Uncategorized') AS category,
        c.color AS color,
        COUNT(*) AS count
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'EXPENSE'
        AND t.transaction_date BETWEEN ? AND ?
      GROUP BY c.id, c.name, c.color
      ORDER BY count DESC, SUM(t.amount_paise) DESC, category ASC
      LIMIT 1
    `)
    .bind(range.from, range.to)
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

async function getCategoryBreakdown(db, range) {
  const rows = await db
    .prepare(`
      SELECT
        COALESCE(c.name, 'Uncategorized') AS category,
        c.color AS color,
        COALESCE(SUM(t.amount_paise), 0) AS amount_paise
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'EXPENSE'
        AND t.transaction_date BETWEEN ? AND ?
      GROUP BY c.id, c.name, c.color
      ORDER BY amount_paise DESC, category ASC
    `)
    .bind(range.from, range.to)
    .all();

  return (rows.results || []).map((row) => ({
    category: row.category,
    amountPaise: toInteger(row.amount_paise),
    color: row.color ?? DEFAULT_CATEGORY_COLOR,
  }));
}

async function getDailyTrend(db, range) {
  const rows = await db
    .prepare(`
      SELECT
        transaction_date AS date,
        COALESCE(SUM(amount_paise), 0) AS amount_paise
      FROM transactions
      WHERE type = 'EXPENSE'
        AND transaction_date BETWEEN ? AND ?
      GROUP BY transaction_date
      ORDER BY transaction_date ASC
    `)
    .bind(range.from, range.to)
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

async function getMonthlyTrend(db, year) {
  const rows = await db
    .prepare(`
      SELECT
        SUBSTR(transaction_date, 1, 7) AS month,
        COALESCE(SUM(amount_paise), 0) AS amount_paise
      FROM transactions
      WHERE type = 'EXPENSE'
        AND transaction_date BETWEEN ? AND ?
      GROUP BY SUBSTR(transaction_date, 1, 7)
      ORDER BY month ASC
    `)
    .bind(`${year}-01-01`, `${year}-12-31`)
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

function mapRecentTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    amountPaise: toInteger(row.amount_paise),
    categoryId: row.category_id ?? null,
    categoryName: row.category_name ?? null,
    categoryColor: row.category_color ?? null,
    paymentMethodId: row.payment_method_id ?? null,
    paymentMethodName: row.payment_method_name ?? null,
    transactionDate: row.transaction_date,
    merchant: row.merchant,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getRecentTransactions(db) {
  const rows = await db
    .prepare(`
      SELECT
        t.id,
        t.type,
        t.title,
        t.amount_paise,
        t.category_id,
        c.name AS category_name,
        c.color AS category_color,
        t.payment_method_id,
        pm.name AS payment_method_name,
        t.transaction_date,
        t.merchant,
        t.notes,
        t.created_at,
        t.updated_at
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
      ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC
      LIMIT ?
    `)
    .bind(RECENT_TRANSACTION_LIMIT)
    .all();

  return (rows.results || []).map(mapRecentTransaction);
}

export function validateStatsQuery(input) {
  return validate(statsQuerySchema, input);
}

export async function getDashboardStats(db, query, options = {}) {
  const now = options.now ?? new Date();
  const today = todayInKolkata(now);
  const weekStartDay = await getWeekStartDay(db);
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

  const todaySpentPaise = await sumExpensesForRange(db, todayRange);
  const weekSpentPaise = await sumExpensesForRange(db, weekRange);
  const monthSpentPaise = await sumExpensesForRange(db, monthRange);
  const totals = await getSelectedPeriodTotals(db, selectedRange);
  const dayCount = Math.max(countInclusiveDays(selectedRange.from, selectedRange.to), 1);
  const biggestExpense = await getBiggestExpense(db, selectedRange);
  const mostUsedCategory = await getMostUsedCategory(db, selectedRange);
  const categoryBreakdown = await getCategoryBreakdown(db, selectedRange);
  const dailyTrend = await getDailyTrend(db, dailyTrendRange);
  const monthlyTrend = await getMonthlyTrend(db, currentYear);
  const recentTransactions = await getRecentTransactions(db);

  return {
    todaySpentPaise,
    weekSpentPaise,
    monthSpentPaise,
    totalIncomePaise: totals.totalIncomePaise,
    totalExpensePaise: totals.totalExpensePaise,
    netBalancePaise: totals.netBalancePaise,
    averageDailySpendPaise: Math.round(totals.totalExpensePaise / dayCount),
    transactionCount: totals.transactionCount,
    biggestExpense,
    mostUsedCategory,
    categoryBreakdown,
    dailyTrend,
    monthlyTrend,
    recentTransactions,
  };
}
