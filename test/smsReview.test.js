import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmSmsImport,
  deriveConfidence,
  listSmsImports,
  validateSmsImportId,
  validateSmsImportQuery,
} from "../functions/_shared/smsReview.js";

const USER_ID = "phone:9949055750";

class RecordingListDb {
  constructor() {
    this.statements = [];
  }

  prepare(sql) {
    const statement = { sql, bindings: [] };

    this.statements.push(statement);

    return {
      bind(...values) {
        statement.bindings = values;
        return this;
      },
      async first() {
        return { total: 0 };
      },
      async all() {
        return { results: [] };
      },
    };
  }
}

// Mimics the two-step confirm flow: SELECT existing row, UPDATE, SELECT updated row.
class ConfirmDb {
  constructor(row) {
    this.row = row;
    this.updates = [];
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
        if (!sql.includes("FROM sms_imports")) {
          throw new Error(`Unexpected confirm query: ${sql}`);
        }

        const [userId, id] = this.values;

        if (!db.row || db.row.user_id !== userId || db.row.id !== id) {
          return null;
        }

        return db.row;
      },
      async run() {
        if (!sql.includes("UPDATE sms_imports")) {
          throw new Error(`Unexpected confirm mutation: ${sql}`);
        }

        db.updates.push({ sql, values: this.values });

        if (db.row) {
          db.row = { ...db.row, status: "CONFIRMED", reviewed_at: "2026-06-30 10:00:00" };
        }

        return { meta: { changes: 1 } };
      },
    };
  }
}

test("derives confidence from parsed fields", () => {
  assert.equal(deriveConfidence(45000, "SWIGGY"), "HIGH");
  assert.equal(deriveConfidence(45000, null), "MEDIUM");
  assert.equal(deriveConfidence(45000, "   "), "MEDIUM");
  assert.equal(deriveConfidence(null, "SWIGGY"), "LOW");
  assert.equal(deriveConfidence(undefined, null), "LOW");
});

test("query validation maps status filters and paginates", () => {
  for (const status of ["all", "needs_review", "confirmed"]) {
    const result = validateSmsImportQuery(new URLSearchParams({ status }));

    assert.equal(result.ok, true);
    assert.equal(result.data.status, status);
  }

  const defaulted = validateSmsImportQuery(new URLSearchParams());

  assert.equal(defaulted.ok, true);
  assert.equal(defaulted.data.status, "all");
  assert.equal(defaulted.data.limit, 50);
  assert.equal(defaulted.data.offset, 0);

  assert.equal(
    validateSmsImportQuery(new URLSearchParams({ status: "garbage" })).ok,
    false,
  );
});

test("id validation rejects non-positive ids", () => {
  assert.equal(validateSmsImportId("7").ok, true);
  assert.equal(validateSmsImportId("0").ok, false);
  assert.equal(validateSmsImportId("abc").ok, false);
});

test("listing scopes every query to the authenticated user", async () => {
  const db = new RecordingListDb();
  const validation = validateSmsImportQuery(
    new URLSearchParams({ status: "needs_review" }),
  );

  assert.equal(validation.ok, true);
  await listSmsImports(db, USER_ID, validation.data);

  assert.equal(db.statements.length, 2);

  for (const statement of db.statements) {
    assert.match(statement.sql, /si\.user_id = \?/);
    assert.equal(statement.bindings[0], USER_ID);
    // needs_review maps to PENDING status filter
    assert.match(statement.sql, /si\.status = \?/);
    assert.equal(statement.bindings[1], "PENDING");
  }
});

test("listing with status=all omits the status filter", async () => {
  const db = new RecordingListDb();
  const validation = validateSmsImportQuery(new URLSearchParams({ status: "all" }));

  await listSmsImports(db, USER_ID, validation.data);

  for (const statement of db.statements) {
    assert.doesNotMatch(statement.sql, /si\.status = \?/);
  }
});

test("listing derives confidence and falls back to a generated title", async () => {
  class RowDb {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return { total: 1 };
        },
        async all() {
          return {
            results: [
              {
                id: 1,
                sender: "HDFCBK",
                raw_message: "Rs.10 debited",
                amount_paise: null,
                merchant: null,
                suggested_type: "EXPENSE",
                transaction_date: "2026-06-30",
                transaction_time: "12:00",
                status: "PENDING",
                transaction_id: 5,
                transaction_title: null,
              },
            ],
          };
        },
      };
    }
  }

  const result = await listSmsImports(new RowDb(), USER_ID, {
    status: "all",
    limit: 50,
    offset: 0,
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].confidence, "LOW");
  assert.equal(result.items[0].amountPaise, null);
  assert.equal(result.items[0].title, "SMS transaction from HDFCBK");
  assert.equal(result.items[0].transactionId, 5);
});

test("confirming marks a user's import reviewed", async () => {
  const db = new ConfirmDb({
    id: 3,
    user_id: USER_ID,
    sender: "HDFCBK",
    amount_paise: 45000,
    merchant: "SWIGGY",
    status: "PENDING",
    reviewed_at: null,
    suggested_type: "EXPENSE",
    transaction_date: "2026-06-30",
    transaction_time: "12:00",
    transaction_id: 9,
    transaction_title: "SWIGGY",
  });

  const result = await confirmSmsImport(db, USER_ID, 3);

  assert.equal(db.updates.length, 1);
  assert.equal(db.updates[0].values[0], USER_ID);
  assert.equal(db.updates[0].values[1], 3);
  assert.equal(result.status, "CONFIRMED");
  assert.equal(result.confidence, "HIGH");
});

test("confirming another user's import is rejected as not found", async () => {
  const db = new ConfirmDb({
    id: 3,
    user_id: "phone:other",
    status: "PENDING",
  });

  await assert.rejects(() => confirmSmsImport(db, USER_ID, 3), /not found/i);
  assert.equal(db.updates.length, 0);
});
