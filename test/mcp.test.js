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

// ---- Final-review follow-up: broader tool coverage + endpoint hardening ----

import { resolvePeriodRange } from "../functions/_shared/mcp/tools.js";

const FIXED_NOW = new Date("2026-06-15T12:00:00+05:30");

test("resolvePeriodRange resolves each period to a Kolkata date range", () => {
  assert.deepEqual(resolvePeriodRange({ period: "today" }, FIXED_NOW), {
    from: "2026-06-15",
    to: "2026-06-15",
  });
  assert.deepEqual(resolvePeriodRange({ period: "year" }, FIXED_NOW), {
    from: "2026-01-01",
    to: "2026-12-31",
  });
  assert.equal(resolvePeriodRange({ period: "month" }, FIXED_NOW).from, "2026-06-01");
  assert.equal(resolvePeriodRange({}, FIXED_NOW).from, "2026-06-01"); // defaults to month

  const week = resolvePeriodRange({ period: "week" }, FIXED_NOW);
  assert.ok(week.from <= "2026-06-15" && week.to >= "2026-06-15");

  assert.deepEqual(
    resolvePeriodRange({ period: "custom", from: "2026-03-01", to: "2026-03-31" }, FIXED_NOW),
    { from: "2026-03-01", to: "2026-03-31" },
  );
});

test("resolvePeriodRange rejects an unknown period or a custom period without from/to", () => {
  assert.throws(() => resolvePeriodRange({ period: "custom" }, FIXED_NOW), /custom period requires/);
  assert.throws(() => resolvePeriodRange({ period: "bogus" }, FIXED_NOW), /Unknown period/);
});

// Generic D1 stand-in: dispatches first()/all()/run() by SQL substring match.
class RowsDb {
  constructor(handlers) {
    this.handlers = handlers;
  }

  prepare(sql) {
    const db = this;
    const pick = (kind) => {
      const handler = db.handlers.find((h) => sql.includes(h.match) && h[kind]);
      if (!handler) {
        throw new Error(`Unexpected ${kind}(): ${sql}`);
      }
      return handler[kind];
    };
    return {
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async first() {
        return pick("first")(this.values);
      },
      async all() {
        return pick("all")(this.values);
      },
      async run() {
        return pick("run")(this.values);
      },
    };
  }
}

function callToolRpc(name, args, db) {
  return handleRpc(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    { db, userId: "phone:9949055750", tools, now: FIXED_NOW },
  );
}

test("tools/call list_categories returns categories through the full stack", async () => {
  const db = new RowsDb([
    {
      match: "FROM categories c",
      all: () => ({
        results: [
          {
            id: 1,
            name: "Food",
            type: "EXPENSE",
            color: "#ef4444",
            icon: null,
            parent_id: null,
            parent_name: null,
            is_default: 1,
            created_at: "x",
            updated_at: "x",
          },
        ],
      }),
    },
  ]);
  const response = await callToolRpc("list_categories", {}, db);
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.items[0].name, "Food");
});

test("tools/call list_payment_methods returns methods", async () => {
  const db = new RowsDb([
    {
      match: "FROM payment_methods",
      all: () => ({
        results: [{ id: 3, name: "UPI", is_default: 1, created_at: "x", updated_at: "x" }],
      }),
    },
  ]);
  const response = await callToolRpc("list_payment_methods", {}, db);
  assert.equal(response.result.structuredContent.items[0].name, "UPI");
});

test("tools/call list_budgets converts paise to rupees end to end", async () => {
  const db = new RowsDb([
    { match: "FROM transactions", all: () => ({ results: [] }) },
    { match: "FROM recurring_expenses", all: () => ({ results: [] }) },
    {
      match: "FROM budgets b",
      all: () => ({
        results: [
          {
            id: 1,
            user_id: "phone:9949055750",
            category_id: 1,
            category_name: "Food",
            category_type: "EXPENSE",
            category_color: "#ef4444",
            category_icon: null,
            category_parent_id: null,
            category_parent_name: null,
            amount_paise: 500000,
            period: "MONTHLY",
            is_active: 1,
            created_at: "x",
            updated_at: "x",
          },
        ],
      }),
    },
  ]);
  const response = await callToolRpc("list_budgets", {}, db);
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.items[0].amount, 5000); // 500000 paise
  assert.equal(response.result.structuredContent.items[0].amountPaise, undefined);
  assert.equal(response.result.structuredContent.summary.totalBudgeted, 5000);
});

test("onRequest returns a JSON-RPC internal error when the DB binding is missing", async () => {
  const request = new Request("https://tracker.example/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${MCP_TOKEN}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });
  const response = await onRequest({ request, env: { MCP_TOKEN } }); // env has no DB
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.code, -32603);
});
