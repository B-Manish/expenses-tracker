import assert from "node:assert/strict";
import test from "node:test";
import {
  createSavedView,
  deleteSavedView,
  getSavedViewById,
  listSavedViews,
  updateSavedView,
  validateSavedViewPayload,
} from "../functions/_shared/savedViews.js";

const USER_ID = "phone:9949055750";
const OTHER_USER_ID = "phone:1111111111";

// Minimal in-memory D1 stand-in. Dispatches on the SQL the helper emits.
class MemoryDb {
  constructor(seed = []) {
    this.views = seed.map((row) => ({ ...row }));
    this.nextId = this.views.reduce((max, row) => Math.max(max, row.id), 0) + 1;
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
        if (sql.includes("LOWER(name) = LOWER(?)")) {
          const [userId, name, ignoredId] = this.values;
          const row = db.views.find((v) =>
            v.user_id === userId &&
            v.name.toLowerCase() === String(name).toLowerCase() &&
            (ignoredId === null || v.id !== ignoredId),
          );
          return row ? { id: row.id } : null;
        }

        if (sql.includes("WHERE user_id = ? AND id = ?")) {
          const [userId, id] = this.values;
          const row = db.views.find((v) => v.user_id === userId && v.id === id);
          return row ? { ...row } : null;
        }

        throw new Error(`Unexpected first() query: ${sql}`);
      },
      async all() {
        if (sql.includes("ORDER BY is_default DESC")) {
          const [userId] = this.values;
          const rows = db.views
            .filter((v) => v.user_id === userId)
            .sort((a, b) =>
              b.is_default - a.is_default ||
              a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
              a.id - b.id,
            );
          return { results: rows.map((row) => ({ ...row })) };
        }

        throw new Error(`Unexpected all() query: ${sql}`);
      },
      async run() {
        if (sql.includes("INSERT INTO saved_transaction_views")) {
          const [user_id, name, filters, is_default] = this.values;
          const id = db.nextId++;
          db.views.push({
            id,
            user_id,
            name,
            filters,
            is_default,
            created_at: "2026-06-30 00:00:00",
            updated_at: "2026-06-30 00:00:00",
          });
          return { meta: { last_row_id: id, changes: 1 } };
        }

        if (sql.includes("SET name = ?")) {
          const [name, filters, is_default, user_id, id] = this.values;
          const row = db.views.find((v) => v.user_id === user_id && v.id === id);
          if (row) {
            row.name = name;
            row.filters = filters;
            row.is_default = is_default;
          }
          return { meta: { changes: row ? 1 : 0 } };
        }

        if (sql.includes("SET is_default = 0")) {
          const [user_id, exceptId] = this.values;
          for (const v of db.views) {
            if (v.user_id === user_id && v.is_default === 1 && (exceptId === null || v.id !== exceptId)) {
              v.is_default = 0;
            }
          }
          return { meta: { changes: 1 } };
        }

        if (sql.includes("DELETE FROM saved_transaction_views")) {
          const [user_id, id] = this.values;
          const index = db.views.findIndex((v) => v.user_id === user_id && v.id === id);
          if (index >= 0) {
            db.views.splice(index, 1);
          }
          return { meta: { changes: index >= 0 ? 1 : 0 } };
        }

        throw new Error(`Unexpected run() query: ${sql}`);
      },
    };
  }
}

function seedView(overrides = {}) {
  return {
    id: 1,
    user_id: USER_ID,
    name: "This month",
    filters: JSON.stringify({ type: "ALL", from: "2026-06-01", to: "2026-06-30" }),
    is_default: 0,
    created_at: "2026-06-01 00:00:00",
    updated_at: "2026-06-01 00:00:00",
    ...overrides,
  };
}

test("validateSavedViewPayload accepts a name with filters and defaults", () => {
  const result = validateSavedViewPayload({ name: "UPI only", filters: { source: "MANUAL" } });

  assert.equal(result.ok, true);
  assert.equal(result.data.name, "UPI only");
  assert.equal(result.data.isDefault, false);
  assert.equal(result.data.filters.source, "MANUAL");
});

test("validateSavedViewPayload requires a non-empty, bounded name", () => {
  assert.equal(validateSavedViewPayload({ filters: {} }).ok, false);
  assert.equal(validateSavedViewPayload({ name: "   " }).ok, false);
  assert.equal(validateSavedViewPayload({ name: "x".repeat(81) }).ok, false);
});

test("validateSavedViewPayload rejects invalid filter JSON values", () => {
  assert.equal(validateSavedViewPayload({ name: "Bad", filters: { from: "2026-99-99" } }).ok, false);
  assert.equal(
    validateSavedViewPayload({ name: "Bad", filters: { minAmount: "9", maxAmount: "1" } }).ok,
    false,
  );
});

test("validateSavedViewPayload rejects a non-object body", () => {
  assert.equal(validateSavedViewPayload("not-json").ok, false);
  assert.equal(validateSavedViewPayload(null).ok, false);
});

test("validateSavedViewPayload patch requires at least one field", () => {
  assert.equal(validateSavedViewPayload({}, { partial: true }).ok, false);
  assert.equal(validateSavedViewPayload({ name: "Renamed" }, { partial: true }).ok, true);
});

test("createSavedView stores the validated filter JSON", async () => {
  const db = new MemoryDb();
  const payload = validateSavedViewPayload({
    name: "Food this month",
    filters: { type: "EXPENSE", search: "swiggy" },
  });

  const view = await createSavedView(db, USER_ID, payload.data);

  assert.equal(db.views.length, 1);
  assert.equal(db.views[0].user_id, USER_ID);
  assert.equal(view.name, "Food this month");
  assert.equal(view.filters.search, "swiggy");
  assert.equal(view.isDefault, false);
});

test("createSavedView prevents duplicate names case-insensitively", async () => {
  const db = new MemoryDb([seedView({ name: "This Month" })]);

  await assert.rejects(
    () => createSavedView(db, USER_ID, { name: "this month", filters: {} }),
    /already exists/,
  );
  assert.equal(db.views.length, 1);
});

test("creating a default view clears any previous default", async () => {
  const db = new MemoryDb([seedView({ id: 1, name: "Old default", is_default: 1 })]);

  const created = await createSavedView(db, USER_ID, {
    name: "New default",
    filters: {},
    isDefault: true,
  });

  assert.equal(created.isDefault, true);
  const defaults = db.views.filter((v) => v.is_default === 1);
  assert.equal(defaults.length, 1);
  assert.equal(defaults[0].name, "New default");
});

test("updateSavedView renames and can set a new default", async () => {
  const db = new MemoryDb([
    seedView({ id: 1, name: "Default", is_default: 1 }),
    seedView({ id: 2, name: "Other", is_default: 0 }),
  ]);

  const updated = await updateSavedView(db, USER_ID, 2, { name: "Promoted", isDefault: true });

  assert.equal(updated.name, "Promoted");
  assert.equal(updated.isDefault, true);
  assert.equal(db.views.find((v) => v.id === 1).is_default, 0);
});

test("updateSavedView replaces stored filters", async () => {
  const db = new MemoryDb([seedView({ id: 1 })]);

  const updated = await updateSavedView(db, USER_ID, 1, {
    filters: { type: "INCOME", source: "SMS" },
  });

  assert.equal(updated.filters.type, "INCOME");
  assert.equal(updated.filters.source, "SMS");
  assert.equal(updated.name, "This month");
});

test("deleteSavedView removes the owner's view", async () => {
  const db = new MemoryDb([seedView({ id: 1 })]);

  const result = await deleteSavedView(db, USER_ID, 1);

  assert.deepEqual(result, { deleted: true });
  assert.equal(db.views.length, 0);
});

test("saved views are isolated per user", async () => {
  const db = new MemoryDb([seedView({ id: 1, is_default: 1 })]);

  assert.equal(await getSavedViewById(db, OTHER_USER_ID, 1), null);

  const otherList = await listSavedViews(db, OTHER_USER_ID);
  assert.equal(otherList.items.length, 0);

  await assert.rejects(() => updateSavedView(db, OTHER_USER_ID, 1, { name: "Hijack" }), /not found/);
  await assert.rejects(() => deleteSavedView(db, OTHER_USER_ID, 1), /not found/);

  // The owner's view is untouched.
  assert.equal(db.views.length, 1);
  assert.equal(db.views[0].name, "This month");
});
