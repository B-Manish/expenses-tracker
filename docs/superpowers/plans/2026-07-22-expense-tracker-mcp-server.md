# Expense Tracker MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a remote MCP server (a single Cloudflare Pages Function at `POST /mcp`) that lets MCP clients query and manage the expense tracker in natural language.

**Architecture:** Stateless Streamable-HTTP JSON-RPC endpoint. `functions/mcp/index.js` does bearer auth → JSON-RPC dispatch. The dispatcher (`functions/_shared/mcp/protocol.js`) routes `initialize`/`tools/list`/`tools/call`/`ping`. Tools (`functions/_shared/mcp/tools.js`) are thin wrappers over the existing `functions/_shared/*` modules, called with a fixed single-user id and `env.DB`. Amounts are rupees at the tool boundary; results are converted paise→rupees before returning.

**Tech Stack:** Cloudflare Pages Functions (Workers runtime), D1 (`env.DB`), Zod (already a dependency), `node:test` for tests. No new dependencies. Hand-rolled JSON-RPC (~150 lines) — the official MCP SDK's Streamable-HTTP transport is Node-`http`-shaped and does not fit the Workers runtime.

## Global Constraints

- **No new dependencies.** JSON-RPC and crypto are hand-rolled; reuse existing `_shared` modules and `zod`.
- **ES modules**, `"type": "module"`; import paths end in `.js`.
- **Single user:** `userId = env.MCP_USER_ID?.trim() || DEFAULT_USER_ID` (`"phone:9949055750"`, exported from `functions/_shared/auth.js`). Never take a user id as a tool argument.
- **Money:** tool inputs accept rupees (existing schemas' `amount` field); tool outputs convert every `*Paise` key to a rupees Number with the `Paise` suffix stripped.
- **Auth secret:** `MCP_TOKEN`, minimum 32 chars, checked with SHA-256 + constant-time compare (mirrors `functions/_shared/smsImports.js`).
- **Tests:** live in `test/*.test.js`, import from `../functions/_shared/...`, use `node:test` + `node:assert/strict`, and use hand-written SQL-dispatching DB stubs (mirror `test/transactions.test.js` and `test/budgets.test.js`). Do NOT introduce real SQLite. Run the full suite with `npm test`.
- **No changes to existing API endpoints or migrations.**

---

## File Structure

- `functions/mcp/index.js` — POST handler: method guard → auth → parse → dispatch → HTTP response.
- `functions/_shared/mcp/auth.js` — `requireMcpAuthorization(request, env)`.
- `functions/_shared/mcp/serialize.js` — `toRupeesView(value)`, `resolveCategoryRef(db, userId, ref)`, `resolvePaymentMethodRef(db, userId, ref)`.
- `functions/_shared/mcp/tools.js` — `tools` registry (17 tools: definition + handler) and `resolvePeriodRange`.
- `functions/_shared/mcp/protocol.js` — `handleRpc(message, ctx)` and `listToolDefinitions(tools)`.
- `test/mcp.test.js` — glue tests (auth, serialization, dispatch, one end-to-end call).
- `README` MCP section + `DEPLOYMENT_SYNC_GUIDE.md` secret/verify updates + `.dev.vars.example` (if present).

---

### Task 1: Bearer auth

**Files:**
- Create: `functions/_shared/mcp/auth.js`
- Test: `test/mcp.test.js` (create; auth cases first)

**Interfaces:**
- Produces: `requireMcpAuthorization(request, env)` → `Promise<{ ok: true } | { ok: false, status: number, message: string }>`.

- [ ] **Step 1: Write the failing test**

Create `test/mcp.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { requireMcpAuthorization } from "../functions/_shared/mcp/auth.js";

const TOKEN = "test-mcp-token-at-least-32-characters-long";

function req(headers = {}) {
  return new Request("https://tracker.example/mcp", { method: "POST", headers });
}

test("requireMcpAuthorization rejects when MCP_TOKEN is not configured", async () => {
  const result = await requireMcpAuthorization(req({ authorization: `Bearer ${TOKEN}` }), {});
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
});

test("requireMcpAuthorization rejects a missing Authorization header", async () => {
  const result = await requireMcpAuthorization(req(), { MCP_TOKEN: TOKEN });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("requireMcpAuthorization rejects a wrong token", async () => {
  const result = await requireMcpAuthorization(
    req({ authorization: "Bearer wrong-token-wrong-token-wrong-token-xx" }),
    { MCP_TOKEN: TOKEN },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("requireMcpAuthorization accepts the correct bearer token", async () => {
  const result = await requireMcpAuthorization(req({ authorization: `Bearer ${TOKEN}` }), { MCP_TOKEN: TOKEN });
  assert.equal(result.ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../functions/_shared/mcp/auth.js`.

- [ ] **Step 3: Write the implementation**

Create `functions/_shared/mcp/auth.js`:

```js
const encoder = new TextEncoder();

// ponytail: sha256 + constantTimeEqual duplicated from smsImports.js to avoid
// touching the working SMS auth path. Extract to a shared crypto helper only if
// a third consumer appears.
async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function constantTimeEqual(first, second) {
  if (first.byteLength !== second.byteLength) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < first.byteLength; index += 1) {
    difference |= first[index] ^ second[index];
  }

  return difference === 0;
}

function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());

  return match ? match[1].trim() : null;
}

export async function requireMcpAuthorization(request, env) {
  const configured = env?.MCP_TOKEN;

  if (typeof configured !== "string" || configured.length < 32) {
    return { ok: false, status: 500, message: "MCP server is not configured" };
  }

  const presented = getBearerToken(request);

  if (!presented) {
    return { ok: false, status: 401, message: "Authentication required" };
  }

  const [presentedHash, configuredHash] = await Promise.all([sha256(presented), sha256(configured)]);

  if (!constantTimeEqual(presentedHash, configuredHash)) {
    return { ok: false, status: 401, message: "Authentication required" };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (4 auth tests).

- [ ] **Step 5: Commit**

```bash
git add functions/_shared/mcp/auth.js test/mcp.test.js
git commit -m "feat(mcp): bearer-token authorization for the MCP endpoint"
```

---

### Task 2: Serialization and reference resolution

**Files:**
- Create: `functions/_shared/mcp/serialize.js`
- Test: `test/mcp.test.js` (append)

**Interfaces:**
- Consumes: `badRequest` from `functions/_shared/errors.js`.
- Produces:
  - `toRupeesView(value)` → deep copy with every numeric `*Paise` key replaced by a `Paise`-stripped key holding `paise / 100`.
  - `resolveCategoryRef(db, userId, ref)` → `Promise<number | null>` (null when ref empty; throws `badRequest` on unknown name).
  - `resolvePaymentMethodRef(db, userId, ref)` → same contract.

- [ ] **Step 1: Write the failing test**

Append to `test/mcp.test.js`:

```js
import {
  resolveCategoryRef,
  resolvePaymentMethodRef,
  toRupeesView,
} from "../functions/_shared/mcp/serialize.js";

test("toRupeesView converts every *Paise key to rupees, recursively", () => {
  const view = toRupeesView({
    amountPaise: 25000,
    label: "lunch",
    nested: { spentPaise: 100, remainingPaise: -250 },
    items: [{ totalPaise: 50 }],
    percentUsed: 90,
  });

  assert.deepEqual(view, {
    amount: 250,
    label: "lunch",
    nested: { spent: 1, remaining: -2.5 },
    items: [{ total: 0.5 }],
    percentUsed: 90,
  });
});

// Minimal DB stub for name lookups: returns a row when the seeded name matches.
class LookupDb {
  constructor(table, rows) {
    this.table = table;
    this.rows = rows;
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
        if (!sql.includes(`FROM ${db.table}`)) {
          throw new Error(`Unexpected query: ${sql}`);
        }
        const [, name] = this.values;
        const row = db.rows.find((r) => r.name.toLowerCase() === String(name).toLowerCase());
        return row ? { id: row.id } : null;
      },
    };
  }
}

test("resolveCategoryRef passes through ids and resolves names", async () => {
  const db = new LookupDb("categories", [{ id: 7, name: "Food" }]);
  assert.equal(await resolveCategoryRef(db, "u", 7), 7);
  assert.equal(await resolveCategoryRef(db, "u", "9"), 9);
  assert.equal(await resolveCategoryRef(db, "u", "food"), 7);
  assert.equal(await resolveCategoryRef(db, "u", ""), null);
  assert.equal(await resolveCategoryRef(db, "u", undefined), null);
  await assert.rejects(() => resolveCategoryRef(db, "u", "Nope"), /Unknown category: Nope/);
});

test("resolvePaymentMethodRef resolves names too", async () => {
  const db = new LookupDb("payment_methods", [{ id: 3, name: "UPI" }]);
  assert.equal(await resolvePaymentMethodRef(db, "u", "upi"), 3);
  await assert.rejects(() => resolvePaymentMethodRef(db, "u", "Bitcoin"), /Unknown payment method/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../functions/_shared/mcp/serialize.js`.

- [ ] **Step 3: Write the implementation**

Create `functions/_shared/mcp/serialize.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (serialization + resolver tests).

- [ ] **Step 5: Commit**

```bash
git add functions/_shared/mcp/serialize.js test/mcp.test.js
git commit -m "feat(mcp): rupee serialization and category/payment-method resolution"
```

---

### Task 3: Tool registry

**Files:**
- Create: `functions/_shared/mcp/tools.js`
- Test: `test/mcp.test.js` (append registry-shape test)

**Interfaces:**
- Consumes: all `list*/create*/update*/delete*/remove*` + `validate*` functions from `functions/_shared/{transactions,categories,paymentMethods,budgets}.js`; `getDashboardStats`, `validateStatsQuery` from `stats.js`; `currentMonthRangeInKolkata`, `currentWeekRangeInKolkata`, `todayInKolkata` from `dates.js`; `badRequest` from `errors.js`; `resolveCategoryRef`, `resolvePaymentMethodRef` from `./serialize.js`.
- Produces: `tools` — an object keyed by tool name; each value is `{ description, inputSchema, annotations, handler }`. `handler({ db, userId, args, now })` returns a plain business object (still in paise). Also exports `resolvePeriodRange(args, now)`.

- [ ] **Step 1: Write the failing test**

Append to `test/mcp.test.js`:

```js
import { tools } from "../functions/_shared/mcp/tools.js";

test("tools registry exposes all 17 tools with schemas and annotations", () => {
  const names = Object.keys(tools).sort();
  assert.deepEqual(names, [
    "create_budget",
    "create_category",
    "create_payment_method",
    "create_transaction",
    "delete_budget",
    "delete_category",
    "delete_payment_method",
    "delete_transaction",
    "get_spending_summary",
    "list_budgets",
    "list_categories",
    "list_payment_methods",
    "list_transactions",
    "update_budget",
    "update_category",
    "update_payment_method",
    "update_transaction",
  ]);

  for (const [name, tool] of Object.entries(tools)) {
    assert.equal(typeof tool.description, "string", `${name} description`);
    assert.equal(tool.inputSchema?.type, "object", `${name} inputSchema`);
    assert.equal(typeof tool.handler, "function", `${name} handler`);
  }

  assert.equal(tools.list_transactions.annotations.readOnlyHint, true);
  assert.equal(tools.delete_transaction.annotations.destructiveHint, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../functions/_shared/mcp/tools.js`.

- [ ] **Step 3: Write the implementation**

Create `functions/_shared/mcp/tools.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (registry shape test + all prior tests).

- [ ] **Step 5: Commit**

```bash
git add functions/_shared/mcp/tools.js test/mcp.test.js
git commit -m "feat(mcp): tool registry wrapping the shared expense modules"
```

---

### Task 4: JSON-RPC dispatch

**Files:**
- Create: `functions/_shared/mcp/protocol.js`
- Test: `test/mcp.test.js` (append)

**Interfaces:**
- Consumes: `toRupeesView` from `./serialize.js`; the `tools` registry shape from Task 3 (injected via `ctx.tools`).
- Produces:
  - `handleRpc(message, ctx)` → `Promise<object | null>`. `ctx = { db, userId, tools, now }`. Returns a JSON-RPC response object, or `null` for notifications.
  - `listToolDefinitions(tools)` → array of `{ name, description, inputSchema, annotations }`.
  - Exported constant `SERVER_INFO = { name: "cashly-expenses", version: "0.1.0" }`.

- [ ] **Step 1: Write the failing test**

Append to `test/mcp.test.js`:

```js
import { handleRpc, listToolDefinitions } from "../functions/_shared/mcp/protocol.js";

// A DB stub for a single list_transactions round trip: COUNT then SELECT slice.
class TxnPagingDb {
  constructor(rows) {
    this.rows = rows;
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
        if (sql.includes("COUNT(*)")) {
          return { total: db.rows.length };
        }
        throw new Error(`Unexpected first(): ${sql}`);
      },
      async all() {
        const offset = this.values[this.values.length - 1];
        const limit = this.values[this.values.length - 2];
        return { results: db.rows.slice(offset, offset + limit) };
      },
    };
  }
}

function txnRow(id) {
  return {
    id,
    type: "EXPENSE",
    title: `Txn ${id}`,
    amount_paise: id * 10000,
    category_id: null,
    transaction_date: "2026-06-15",
    transaction_time: "10:00",
    source: "MANUAL",
    created_at: "2026-06-15 04:30:00",
    updated_at: "2026-06-15 04:30:00",
  };
}

const CTX = () => ({ db: new TxnPagingDb([txnRow(1)]), userId: "phone:9949055750", tools, now: new Date() });

test("initialize returns capabilities, serverInfo and echoes protocolVersion", async () => {
  const response = await handleRpc(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    CTX(),
  );
  assert.equal(response.result.serverInfo.name, "cashly-expenses");
  assert.equal(response.result.protocolVersion, "2025-06-18");
  assert.deepEqual(response.result.capabilities, { tools: {} });
});

test("notifications/initialized produces no response", async () => {
  const response = await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, CTX());
  assert.equal(response, null);
});

test("ping returns an empty result", async () => {
  const response = await handleRpc({ jsonrpc: "2.0", id: 9, method: "ping" }, CTX());
  assert.deepEqual(response.result, {});
});

test("unknown method returns -32601", async () => {
  const response = await handleRpc({ jsonrpc: "2.0", id: 2, method: "does/not/exist" }, CTX());
  assert.equal(response.error.code, -32601);
});

test("batch requests are rejected with -32600", async () => {
  const response = await handleRpc([{ jsonrpc: "2.0", id: 1, method: "ping" }], CTX());
  assert.equal(response.error.code, -32600);
});

test("tools/list returns all tool definitions", async () => {
  const response = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/list" }, CTX());
  assert.equal(response.result.tools.length, 17);
  assert.ok(response.result.tools.every((t) => t.name && t.inputSchema));
});

test("tools/call runs a tool and returns rupees", async () => {
  const response = await handleRpc(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_transactions", arguments: { limit: 10 } } },
    CTX(),
  );
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.items[0].amount, 100); // 10000 paise -> 100 rupees
  assert.equal(response.result.structuredContent.items[0].amountPaise, undefined);
  assert.equal(typeof response.result.content[0].text, "string");
});

test("tools/call surfaces validation errors as isError results", async () => {
  const response = await handleRpc(
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "create_transaction", arguments: { type: "EXPENSE", title: "x", amount: "-5", transactionDate: "2026-06-15" } },
    },
    CTX(),
  );
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /amount|Amount/i);
});

test("tools/call with an unknown tool returns -32602", async () => {
  const response = await handleRpc(
    { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope" } },
    CTX(),
  );
  assert.equal(response.error.code, -32602);
});

test("listToolDefinitions strips handlers", () => {
  const defs = listToolDefinitions(tools);
  assert.equal(defs.length, 17);
  assert.equal(defs[0].handler, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../functions/_shared/mcp/protocol.js`.

- [ ] **Step 3: Write the implementation**

Create `functions/_shared/mcp/protocol.js`:

```js
import { toRupeesView } from "./serialize.js";

const JSONRPC_VERSION = "2.0";
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

export const SERVER_INFO = { name: "cashly-expenses", version: "0.1.0" };

function makeResult(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

function makeError(id, code, message) {
  return { jsonrpc: JSONRPC_VERSION, id, error: { code, message } };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function listToolDefinitions(tools) {
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  }));
}

async function callTool(id, params, ctx) {
  const tool = ctx.tools[params?.name];

  if (!tool) {
    return makeError(id, -32602, `Unknown tool: ${params?.name}`);
  }

  const args = isPlainObject(params.arguments) ? params.arguments : {};

  try {
    const raw = await tool.handler({ db: ctx.db, userId: ctx.userId, args, now: ctx.now });
    const view = toRupeesView(raw);

    return makeResult(id, {
      content: [{ type: "text", text: JSON.stringify(view, null, 2) }],
      structuredContent: isPlainObject(view) ? view : { value: view },
      isError: false,
    });
  } catch (error) {
    const message = error?.publicMessage || error?.message || "Tool execution failed";
    return makeResult(id, { content: [{ type: "text", text: message }], isError: true });
  }
}

export async function handleRpc(message, ctx) {
  if (Array.isArray(message)) {
    return makeError(null, -32600, "Batch requests are not supported");
  }

  if (!isPlainObject(message) || message.jsonrpc !== JSONRPC_VERSION || typeof message.method !== "string") {
    return makeError(message?.id ?? null, -32600, "Invalid Request");
  }

  const id = message.id ?? null;
  const params = isPlainObject(message.params) ? message.params : {};

  switch (message.method) {
    case "initialize":
      return makeResult(id, {
        protocolVersion:
          typeof params.protocolVersion === "string" ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case "notifications/initialized":
      return null;
    case "ping":
      return makeResult(id, {});
    case "tools/list":
      return makeResult(id, { tools: listToolDefinitions(ctx.tools) });
    case "tools/call":
      return callTool(id, params, ctx);
    default:
      return makeError(id, -32601, `Method not found: ${message.method}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (dispatch tests + all prior).

- [ ] **Step 5: Commit**

```bash
git add functions/_shared/mcp/protocol.js test/mcp.test.js
git commit -m "feat(mcp): JSON-RPC dispatch for initialize/tools/ping"
```

---

### Task 5: HTTP endpoint

**Files:**
- Create: `functions/mcp/index.js`
- Test: `test/mcp.test.js` (append end-to-end-through-onRequest cases)

**Interfaces:**
- Consumes: `requireMcpAuthorization` (Task 1), `handleRpc` (Task 4), `tools` (Task 3), `requireDb` from `functions/_shared/db.js`, `DEFAULT_USER_ID` from `functions/_shared/auth.js`.
- Produces: `onRequest(context)` — the Pages Function entry point. `context = { request, env }` (and `env.DB`).

- [ ] **Step 1: Write the failing test**

Append to `test/mcp.test.js`:

```js
import { onRequest } from "../functions/mcp/index.js";

const MCP_TOKEN = "test-mcp-token-at-least-32-characters-long";

function mcpContext(bodyObject, { token = MCP_TOKEN } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const request = new Request("https://tracker.example/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(bodyObject),
  });
  return { request, env: { MCP_TOKEN, DB: new TxnPagingDb([txnRow(2)]) } };
}

test("onRequest rejects non-POST with 405", async () => {
  const response = await onRequest({
    request: new Request("https://tracker.example/mcp", { method: "GET" }),
    env: { MCP_TOKEN },
  });
  assert.equal(response.status, 405);
});

test("onRequest rejects a missing bearer token with 401", async () => {
  const ctx = mcpContext({ jsonrpc: "2.0", id: 1, method: "ping" }, { token: null });
  const response = await onRequest(ctx);
  assert.equal(response.status, 401);
});

test("onRequest returns a JSON-RPC result end to end", async () => {
  const ctx = mcpContext({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "list_transactions", arguments: {} },
  });
  const response = await onRequest(ctx);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.structuredContent.items[0].amount, 200); // txnRow(2) -> 20000 paise
});

test("onRequest returns 202 with no body for a notification", async () => {
  const ctx = mcpContext({ jsonrpc: "2.0", method: "notifications/initialized" });
  const response = await onRequest(ctx);
  assert.equal(response.status, 202);
});

test("onRequest returns a parse error for invalid JSON", async () => {
  const request = new Request("https://tracker.example/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${MCP_TOKEN}` },
    body: "{ not json",
  });
  const response = await onRequest({ request, env: { MCP_TOKEN, DB: new TxnPagingDb([]) } });
  const body = await response.json();
  assert.equal(body.error.code, -32700);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../functions/mcp/index.js`.

- [ ] **Step 3: Write the implementation**

Create `functions/mcp/index.js`:

```js
import { DEFAULT_USER_ID } from "../_shared/auth.js";
import { requireDb } from "../_shared/db.js";
import { requireMcpAuthorization } from "../_shared/mcp/auth.js";
import { handleRpc } from "../_shared/mcp/protocol.js";
import { tools } from "../_shared/mcp/tools.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function rpcErrorBody(code, message) {
  return { jsonrpc: "2.0", id: null, error: { code, message } };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  const auth = await requireMcpAuthorization(request, env);

  if (!auth.ok) {
    return jsonResponse(rpcErrorBody(-32001, auth.message), auth.status);
  }

  let message;

  try {
    message = JSON.parse(await request.text());
  } catch {
    return jsonResponse(rpcErrorBody(-32700, "Parse error"), 200);
  }

  const userId =
    typeof env.MCP_USER_ID === "string" && env.MCP_USER_ID.trim() ? env.MCP_USER_ID.trim() : DEFAULT_USER_ID;

  const response = await handleRpc(message, {
    db: requireDb(context),
    userId,
    tools,
    now: new Date(),
  });

  if (response === null) {
    return new Response(null, { status: 202 });
  }

  return jsonResponse(response, 200);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (endpoint tests + full suite).

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: no errors in the new files.

- [ ] **Step 6: Commit**

```bash
git add functions/mcp/index.js test/mcp.test.js
git commit -m "feat(mcp): POST /mcp Pages Function endpoint"
```

---

### Task 6: Local verification, config, and docs

**Files:**
- Modify: `DEPLOYMENT_SYNC_GUIDE.md`
- Create: `docs/MCP.md`
- Modify: `.dev.vars` (local only, not committed) — add `MCP_TOKEN`

**Interfaces:** none (documentation + config).

- [ ] **Step 1: Add the local secret**

Add to `.dev.vars` (do not commit — it is gitignored):

```env
MCP_TOKEN=local-dev-mcp-token-at-least-32-characters-long
```

- [ ] **Step 2: Build and run locally, then verify the endpoint**

```bash
npm run build
npx wrangler pages dev dist
```

In another terminal, confirm initialize works with the token and fails without it:

```bash
curl -s -X POST http://localhost:8788/mcp \
  -H "authorization: Bearer local-dev-mcp-token-at-least-32-characters-long" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}'
# Expected: JSON with result.serverInfo.name = "cashly-expenses"

curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8788/mcp \
  -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"ping"}'
# Expected: 401
```

(Port may differ; use the port wrangler prints.)

- [ ] **Step 3: Write `docs/MCP.md`**

Create `docs/MCP.md`:

```markdown
# MCP Server

The app exposes a remote MCP server at `POST /mcp` so MCP clients (Claude Code,
Cursor, Codex) can query and manage expenses in natural language.

## Auth

All requests require `Authorization: Bearer <MCP_TOKEN>`. `MCP_TOKEN` is a
Cloudflare secret (and a local `.dev.vars` value), minimum 32 characters. Treat
it like `APP_PASSWORD`: it grants full read/write access to your finances.

## Connect a client

Claude Code:

```bash
claude mcp add --transport http cashly https://tracker.manishbatchu.com/mcp \
  --header "Authorization: Bearer <MCP_TOKEN>"
```

Cursor / Codex: add an MCP server entry with the URL
`https://tracker.manishbatchu.com/mcp` and an `Authorization: Bearer <MCP_TOKEN>`
header.

## Tools

Read: `get_spending_summary`, `list_transactions`, `list_categories`,
`list_payment_methods`, `list_budgets`.

Write: `create/update/delete_transaction`, `create/update/delete_category`,
`create/update/delete_payment_method`, `create/update/delete_budget`.

Amounts are in rupees. Category and payment-method arguments accept a name or an
id. `get_spending_summary` accepts `period` = today/week/month/year, or custom
with `from`+`to`. Delete tools are marked destructive so clients prompt first.
`delete_budget` deactivates an active budget (kept for history) and permanently
removes an already-inactive one.
```

- [ ] **Step 4: Update `DEPLOYMENT_SYNC_GUIDE.md`**

In the runtime-secrets table (around line 76-80), add a row:

```markdown
| `MCP_TOKEN` | Bearer token for the `/mcp` MCP server endpoint | Yes |
```

In the local `.dev.vars` example block (around line 84-88), add:

```env
MCP_TOKEN=your-local-random-token-of-at-least-32-characters
```

In the production secrets list (around line 100-103), add `MCP_TOKEN`.

In the Production Verification Checklist (around line 287-303), add:

```markdown
- `POST /mcp` with a valid `Authorization: Bearer <MCP_TOKEN>` returns an `initialize` result.
- `POST /mcp` without the token returns 401.
```

- [ ] **Step 5: Set the production secret (manual, one-time)**

In the Cloudflare dashboard → Workers & Pages → `expenses-tracker` → Settings →
Production → Variables and Secrets, add `MCP_TOKEN` as an encrypted secret
(≥32 chars). Redeploy so Functions pick it up. (This is an operator action, not
a code change — no commit.)

- [ ] **Step 6: Commit docs**

```bash
git add docs/MCP.md DEPLOYMENT_SYNC_GUIDE.md
git commit -m "docs(mcp): client setup and deployment/verification for /mcp"
```

---

## Self-Review

**Spec coverage:**
- Endpoint `POST /mcp`, stateless Streamable-HTTP, GET→405 → Task 5. ✔
- Bearer auth via `MCP_TOKEN`, sha256 + constant-time → Task 1. ✔
- Single-user id (`MCP_USER_ID`/`DEFAULT_USER_ID`) → Task 5. ✔
- Rupees at the boundary (`toRupeesView`) → Task 2, applied in Task 4. ✔
- Name→id resolution → Task 2, used in Task 3. ✔
- `get_spending_summary` period resolution (Kolkata) → Task 3. ✔
- All 17 tools with annotations, destructiveHint on deletes → Task 3. ✔
- JSON-RPC methods initialize/notifications/ping/tools.list/tools.call + error codes → Task 4. ✔
- Error mapping (ApiError → isError result; protocol errors) → Tasks 4 & 5. ✔
- Config/secrets/docs/verification → Task 6. ✔
- Out of scope (recurring, saved views, OAuth, batch, SSE) — not built. ✔

**Placeholder scan:** No TBD/TODO; every code step contains complete code. `<MCP_TOKEN>` in docs is an intentional literal placeholder for the reader's secret.

**Type consistency:** `requireMcpAuthorization` returns `{ok,status,message}` (Task 1) consumed in Task 5. `handleRpc(message, ctx)` / `ctx={db,userId,tools,now}` consistent across Tasks 4-5. Tool handler shape `handler({db,userId,args,now})` consistent between Tasks 3 and 4. `toRupeesView`/`resolveCategoryRef`/`resolvePaymentMethodRef` signatures consistent between Tasks 2 and 3. `tools` registry keys match the Task 3 test and the Task 4 count (17).

**Note:** The test file location is `test/mcp.test.js` (repo convention), superseding the spec's `functions/_shared/mcp/tools.test.js`.
