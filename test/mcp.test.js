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
