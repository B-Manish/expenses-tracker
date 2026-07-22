import {
  currentMonthRangeInKolkata,
  currentWeekRangeInKolkata,
  todayInKolkata,
} from "../dates.js";
import { badRequest } from "../errors.js";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
  validateTransactionId,
  validateTransactionPayload,
  validateTransactionQuery,
} from "../transactions.js";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  validateCategoryId,
  validateCategoryPayload,
  validateCategoryQuery,
} from "../categories.js";
import {
  createPaymentMethod,
  deletePaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
  validatePaymentMethodId,
  validatePaymentMethodPayload,
} from "../paymentMethods.js";
import {
  createBudget,
  listBudgets,
  removeBudget,
  updateBudget,
  validateBudgetId,
  validateBudgetPayload,
} from "../budgets.js";
import { getDashboardStats, validateStatsQuery } from "../stats.js";
import { resolveCategoryRef, resolvePaymentMethodRef } from "./serialize.js";

function parsed(result) {
  if (!result.ok) {
    throw result.error;
  }

  return result.data;
}

export function resolvePeriodRange(args, now) {
  const period = args.period || "month";
  const today = todayInKolkata(now);

  switch (period) {
    case "today":
      return { from: today, to: today };
    case "week":
      // ponytail: assumes Monday week start (the app default) rather than
      // reading the per-user setting. Wire the setting in if a user changes it.
      return currentWeekRangeInKolkata(now, "MONDAY");
    case "month":
      return currentMonthRangeInKolkata(now);
    case "year": {
      const year = today.slice(0, 4);
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    case "custom":
      if (!args.from || !args.to) {
        throw badRequest("A custom period requires both from and to (YYYY-MM-DD)");
      }
      return { from: args.from, to: args.to };
    default:
      throw badRequest(`Unknown period: ${period}`);
  }
}

function transactionPayloadArgs(args, categoryId, paymentMethodId) {
  return {
    type: args.type,
    title: args.title,
    amount: args.amount,
    categoryId,
    paymentMethodId,
    transactionDate: args.transactionDate,
    transactionTime: args.transactionTime ?? "00:00",
    merchant: args.merchant,
    notes: args.notes,
  };
}

const readOnly = { readOnlyHint: true };
const destructive = { destructiveHint: true };

export const tools = {
  get_spending_summary: {
    description:
      "Spending summary for a period: totals, per-category breakdown, biggest expense, trends and budgets. Use for questions like 'how much did I spend on food this week' by reading the matching category from categoryBreakdown.",
    annotations: readOnly,
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "week", "month", "year", "custom"],
          description: "Defaults to 'month'. Use 'custom' with from+to for an explicit range.",
        },
        from: { type: "string", description: "YYYY-MM-DD, required when period is 'custom'." },
        to: { type: "string", description: "YYYY-MM-DD, required when period is 'custom'." },
      },
    },
    async handler({ db, userId, args, now }) {
      const range = resolvePeriodRange(args, now);
      const query = parsed(validateStatsQuery(range));
      return getDashboardStats(db, query, { userId, now });
    },
  },

  list_transactions: {
    description:
      "List transactions with optional filters. Category and paymentMethod accept a name or an id.",
    annotations: readOnly,
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["ALL", "EXPENSE", "INCOME"] },
        category: { type: ["string", "number"], description: "Category name or id." },
        paymentMethod: { type: ["string", "number"], description: "Payment method name or id." },
        from: { type: "string", description: "YYYY-MM-DD lower bound." },
        to: { type: "string", description: "YYYY-MM-DD upper bound." },
        minAmount: { type: ["string", "number"], description: "Rupees lower bound." },
        maxAmount: { type: ["string", "number"], description: "Rupees upper bound." },
        search: { type: "string" },
        source: { type: "string", enum: ["ALL", "MANUAL", "SMS"] },
        sort: { type: "string" },
        limit: { type: "number", description: "1-100, default 50." },
        offset: { type: "number", description: "Default 0." },
      },
    },
    async handler({ db, userId, args }) {
      const categoryId = await resolveCategoryRef(db, userId, args.category);
      const paymentMethodId = await resolvePaymentMethodRef(db, userId, args.paymentMethod);
      const query = parsed(
        validateTransactionQuery({
          ...args,
          categoryId: categoryId ?? undefined,
          paymentMethodId: paymentMethodId ?? undefined,
        }),
      );
      return listTransactions(db, userId, query);
    },
  },

  create_transaction: {
    description: "Create an expense or income. amount is in rupees. category/paymentMethod accept a name or id.",
    annotations: {},
    inputSchema: {
      type: "object",
      required: ["type", "title", "amount", "transactionDate"],
      properties: {
        type: { type: "string", enum: ["EXPENSE", "INCOME"] },
        title: { type: "string" },
        amount: { type: ["string", "number"], description: "Rupees, e.g. 250 or 250.50." },
        category: { type: ["string", "number"] },
        paymentMethod: { type: ["string", "number"] },
        transactionDate: { type: "string", description: "YYYY-MM-DD." },
        transactionTime: { type: "string", description: "HH:mm, defaults to 00:00." },
        merchant: { type: "string" },
        notes: { type: "string" },
      },
    },
    async handler({ db, userId, args }) {
      const categoryId = await resolveCategoryRef(db, userId, args.category);
      const paymentMethodId = await resolvePaymentMethodRef(db, userId, args.paymentMethod);
      const payload = parsed(validateTransactionPayload(transactionPayloadArgs(args, categoryId, paymentMethodId)));
      return createTransaction(db, userId, payload);
    },
  },

  update_transaction: {
    description: "Replace a transaction's fields by id. amount is in rupees.",
    annotations: {},
    inputSchema: {
      type: "object",
      required: ["id", "type", "title", "amount", "transactionDate"],
      properties: {
        id: { type: "number" },
        type: { type: "string", enum: ["EXPENSE", "INCOME"] },
        title: { type: "string" },
        amount: { type: ["string", "number"] },
        category: { type: ["string", "number"] },
        paymentMethod: { type: ["string", "number"] },
        transactionDate: { type: "string" },
        transactionTime: { type: "string" },
        merchant: { type: "string" },
        notes: { type: "string" },
      },
    },
    async handler({ db, userId, args }) {
      const id = parsed(validateTransactionId(args.id));
      const categoryId = await resolveCategoryRef(db, userId, args.category);
      const paymentMethodId = await resolvePaymentMethodRef(db, userId, args.paymentMethod);
      const payload = parsed(validateTransactionPayload(transactionPayloadArgs(args, categoryId, paymentMethodId)));
      return updateTransaction(db, userId, id, payload);
    },
  },

  delete_transaction: {
    description: "Delete a transaction by id. Also removes a linked SMS import, if any.",
    annotations: destructive,
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "number" } } },
    async handler({ db, userId, args }) {
      return deleteTransaction(db, userId, parsed(validateTransactionId(args.id)));
    },
  },

  list_categories: {
    description: "List categories. Optionally filter by type and include subcategories.",
    annotations: readOnly,
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["EXPENSE", "INCOME"] },
        includeNested: { type: "boolean", description: "Default true." },
      },
    },
    async handler({ db, userId, args }) {
      return listCategories(db, userId, parsed(validateCategoryQuery(args)));
    },
  },

  create_category: {
    description: "Create a category.",
    annotations: {},
    inputSchema: {
      type: "object",
      required: ["name", "type"],
      properties: {
        name: { type: "string" },
        type: { type: "string", enum: ["EXPENSE", "INCOME"] },
        color: { type: "string", description: "Hex like #ef4444." },
        icon: { type: "string" },
        parentId: { type: "number", description: "Top-level category id to nest under." },
      },
    },
    async handler({ db, userId, args }) {
      return createCategory(db, userId, parsed(validateCategoryPayload(args)));
    },
  },

  update_category: {
    description: "Replace a category's fields by id.",
    annotations: {},
    inputSchema: {
      type: "object",
      required: ["id", "name", "type"],
      properties: {
        id: { type: "number" },
        name: { type: "string" },
        type: { type: "string", enum: ["EXPENSE", "INCOME"] },
        color: { type: "string" },
        icon: { type: "string" },
        parentId: { type: "number" },
      },
    },
    async handler({ db, userId, args }) {
      const id = parsed(validateCategoryId(args.id));
      return updateCategory(db, userId, id, parsed(validateCategoryPayload(args)));
    },
  },

  delete_category: {
    description: "Delete a category by id. Rejected for default, in-use, or parent categories.",
    annotations: destructive,
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "number" } } },
    async handler({ db, userId, args }) {
      return deleteCategory(db, userId, parsed(validateCategoryId(args.id)));
    },
  },

  list_payment_methods: {
    description: "List payment methods.",
    annotations: readOnly,
    inputSchema: { type: "object", properties: {} },
    async handler({ db, userId }) {
      return listPaymentMethods(db, userId);
    },
  },

  create_payment_method: {
    description: "Create a payment method.",
    annotations: {},
    inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
    async handler({ db, userId, args }) {
      return createPaymentMethod(db, userId, parsed(validatePaymentMethodPayload(args)));
    },
  },

  update_payment_method: {
    description: "Rename a payment method by id.",
    annotations: {},
    inputSchema: {
      type: "object",
      required: ["id", "name"],
      properties: { id: { type: "number" }, name: { type: "string" } },
    },
    async handler({ db, userId, args }) {
      const id = parsed(validatePaymentMethodId(args.id));
      return updatePaymentMethod(db, userId, id, parsed(validatePaymentMethodPayload(args)));
    },
  },

  delete_payment_method: {
    description: "Delete a payment method by id. Rejected for default or in-use methods.",
    annotations: destructive,
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "number" } } },
    async handler({ db, userId, args }) {
      return deletePaymentMethod(db, userId, parsed(validatePaymentMethodId(args.id)));
    },
  },

  list_budgets: {
    description: "List budgets with monthly spend, remaining, percent used and status.",
    annotations: readOnly,
    inputSchema: { type: "object", properties: {} },
    async handler({ db, userId, now }) {
      return listBudgets(db, userId, { now });
    },
  },

  create_budget: {
    description: "Create a monthly budget for an expense category. amount is in rupees. category accepts a name or id.",
    annotations: {},
    inputSchema: {
      type: "object",
      required: ["category", "amount"],
      properties: {
        category: { type: ["string", "number"] },
        amount: { type: ["string", "number"], description: "Rupees." },
        period: { type: "string", enum: ["MONTHLY"], description: "Default MONTHLY." },
        isActive: { type: "boolean", description: "Default true." },
      },
    },
    async handler({ db, userId, args, now }) {
      const categoryId = await resolveCategoryRef(db, userId, args.category);
      const payload = parsed(validateBudgetPayload({ ...args, categoryId }));
      return createBudget(db, userId, payload, { now });
    },
  },

  update_budget: {
    description: "Replace a budget's fields by id. amount is in rupees.",
    annotations: {},
    inputSchema: {
      type: "object",
      required: ["id", "category", "amount"],
      properties: {
        id: { type: "number" },
        category: { type: ["string", "number"] },
        amount: { type: ["string", "number"] },
        period: { type: "string", enum: ["MONTHLY"] },
        isActive: { type: "boolean" },
      },
    },
    async handler({ db, userId, args, now }) {
      const id = parsed(validateBudgetId(args.id));
      const categoryId = await resolveCategoryRef(db, userId, args.category);
      const payload = parsed(validateBudgetPayload({ ...args, categoryId }));
      return updateBudget(db, userId, id, payload, { now });
    },
  },

  delete_budget: {
    description:
      "Delete a budget by id. An active budget is deactivated (kept for history); an already-inactive budget is permanently removed.",
    annotations: destructive,
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "number" } } },
    async handler({ db, userId, args }) {
      return removeBudget(db, userId, parsed(validateBudgetId(args.id)));
    },
  },
};
