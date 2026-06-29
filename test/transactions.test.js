import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTransactionFilters,
  listTransactions,
  serializeSavedViewFilters,
  validateTransactionFilters,
  validateTransactionQuery,
} from "../functions/_shared/transactions.js";

const USER_ID = "phone:9949055750";

function query(params) {
  const result = validateTransactionQuery(new URLSearchParams(params));

  assert.equal(result.ok, true, result.ok ? "" : result.error?.message);

  return result.data;
}

function filtersFor(params) {
  return { ...query(params), userId: USER_ID };
}

test("validateTransactionQuery applies deterministic defaults", () => {
  const data = query("");

  assert.equal(data.type, "ALL");
  assert.equal(data.source, "ALL");
  assert.equal(data.categoryId, null);
  assert.equal(data.uncategorized, false);
  assert.equal(data.minAmountPaise, null);
  assert.equal(data.maxAmountPaise, null);
  assert.equal(data.sort, "transaction_date_desc");
  assert.equal(data.limit, 50);
  assert.equal(data.offset, 0);
});

test("validateTransactionQuery converts rupee amount bounds to integer paise", () => {
  const data = query("minAmount=100&maxAmount=2500.50");

  assert.equal(data.minAmountPaise, 10000);
  assert.equal(data.maxAmountPaise, 250050);
});

test("validateTransactionQuery treats a zero amount bound as no bound", () => {
  const data = query("minAmount=0");

  assert.equal(data.minAmountPaise, null);
});

test("validateTransactionQuery parses the uncategorized flag", () => {
  assert.equal(query("uncategorized=true").uncategorized, true);
  assert.equal(query("uncategorized=1").uncategorized, true);
  assert.equal(query("uncategorized=false").uncategorized, false);
  assert.equal(query("").uncategorized, false);
});

test("validateTransactionQuery rejects invalid enums and sort fields", () => {
  assert.equal(validateTransactionQuery(new URLSearchParams("type=BOGUS")).ok, false);
  assert.equal(validateTransactionQuery(new URLSearchParams("source=BOGUS")).ok, false);
  assert.equal(validateTransactionQuery(new URLSearchParams("sort=evil_drop")).ok, false);
});

test("validateTransactionQuery enforces date boundaries", () => {
  assert.equal(validateTransactionQuery(new URLSearchParams("from=2026-13-40")).ok, false);
  assert.equal(
    validateTransactionQuery(new URLSearchParams("from=2026-06-30&to=2026-06-01")).ok,
    false,
  );
  assert.equal(
    validateTransactionQuery(new URLSearchParams("from=2026-06-01&to=2026-06-30")).ok,
    true,
  );
});

test("validateTransactionQuery rejects a minimum greater than the maximum", () => {
  const result = validateTransactionQuery(new URLSearchParams("minAmount=500&maxAmount=100"));

  assert.equal(result.ok, false);
  assert.match(result.error.message, /Minimum amount/);
});

test("validateTransactionQuery clamps pagination to safe bounds", () => {
  assert.equal(validateTransactionQuery(new URLSearchParams("limit=1000")).ok, false);
  assert.equal(validateTransactionQuery(new URLSearchParams("offset=-1")).ok, false);
  assert.equal(query("limit=25&offset=50").limit, 25);
  assert.equal(query("limit=25&offset=50").offset, 50);
});

test("buildTransactionFilters scopes every query to the owning user", () => {
  const { whereSql, bindings } = buildTransactionFilters(filtersFor(""));

  assert.match(whereSql, /^WHERE t\.user_id = \?/);
  assert.deepEqual(bindings, [USER_ID]);
});

test("buildTransactionFilters matches uncategorized transactions with IS NULL", () => {
  const { whereSql, bindings } = buildTransactionFilters(filtersFor("uncategorized=true"));

  assert.match(whereSql, /t\.category_id IS NULL/);
  assert.deepEqual(bindings, [USER_ID]);
});

test("buildTransactionFilters prefers uncategorized over a category id", () => {
  const { whereSql } = buildTransactionFilters(filtersFor("uncategorized=true&categoryId=5"));

  assert.match(whereSql, /t\.category_id IS NULL/);
  assert.doesNotMatch(whereSql, /category_id IN/);
});

test("buildTransactionFilters resolves a category to itself and its subcategories", () => {
  const { whereSql, bindings } = buildTransactionFilters(filtersFor("categoryId=7"));

  assert.match(whereSql, /t\.category_id IN/);
  assert.deepEqual(bindings, [USER_ID, USER_ID, 7, 7]);
});

test("buildTransactionFilters combines source, amount bounds and search", () => {
  const { whereSql, bindings } = buildTransactionFilters(
    filtersFor("source=SMS&minAmount=10&maxAmount=20&search=swiggy"),
  );

  assert.match(whereSql, /t\.source = \?/);
  assert.match(whereSql, /t\.amount_paise >= \?/);
  assert.match(whereSql, /t\.amount_paise <= \?/);
  assert.match(whereSql, /LIKE \? ESCAPE/);
  assert.deepEqual(bindings, [USER_ID, "SMS", 1000, 2000, "%swiggy%", "%swiggy%", "%swiggy%"]);
});

test("buildTransactionFilters escapes LIKE wildcards in search", () => {
  const { bindings } = buildTransactionFilters(filtersFor("search=50%25_off"));

  // 50%_off -> wildcards escaped, lowercased, wrapped.
  assert.equal(bindings[1], "%50\\%\\_off%");
});

test("serializeSavedViewFilters returns a clean storable shape", () => {
  const result = serializeSavedViewFilters({
    type: "INCOME",
    source: "SMS",
    minAmount: "100",
    uncategorized: true,
    search: "  rent  ",
    junk: "ignored",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    type: "INCOME",
    source: "SMS",
    categoryId: "",
    uncategorized: "true",
    paymentMethodId: "",
    from: "",
    to: "",
    search: "rent",
    minAmount: "100.00",
    maxAmount: "",
    sort: "transaction_date_desc",
  });
});

test("serializeSavedViewFilters rejects invalid filter values", () => {
  assert.equal(serializeSavedViewFilters({ from: "2026-13-01" }).ok, false);
  assert.equal(serializeSavedViewFilters({ minAmount: "5", maxAmount: "1" }).ok, false);
  assert.equal(validateTransactionFilters({ type: "NOPE" }).ok, false);
});

// Minimal D1 stand-in for list paging: COUNT reports the full filtered set,
// SELECT returns the page slice taken from the trailing LIMIT/OFFSET bindings.
class PagingDb {
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

        throw new Error(`Unexpected first() query: ${sql}`);
      },
      async all() {
        const offset = this.values[this.values.length - 1];
        const limit = this.values[this.values.length - 2];

        return { results: db.rows.slice(offset, offset + limit) };
      },
    };
  }
}

function transactionRow(id) {
  return {
    id,
    type: "EXPENSE",
    title: `Txn ${id}`,
    amount_paise: id * 100,
    category_id: null,
    transaction_date: "2026-06-15",
    transaction_time: "10:00",
    source: "MANUAL",
    created_at: "2026-06-15 04:30:00",
    updated_at: "2026-06-15 04:30:00",
  };
}

test("listTransactions reports filtered totals independent of the page slice", async () => {
  const db = new PagingDb(Array.from({ length: 25 }, (_, index) => transactionRow(index + 1)));

  const firstPage = await listTransactions(db, USER_ID, query("limit=10&offset=0"));
  assert.equal(firstPage.total, 25);
  assert.equal(firstPage.items.length, 10);
  assert.equal(firstPage.items[0].id, 1);
  assert.equal(firstPage.limit, 10);
  assert.equal(firstPage.offset, 0);

  const lastPage = await listTransactions(db, USER_ID, query("limit=10&offset=20"));
  assert.equal(lastPage.total, 25);
  assert.equal(lastPage.items.length, 5);
  assert.equal(lastPage.items[0].id, 21);
});
