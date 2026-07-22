import assert from "node:assert/strict";
import test from "node:test";
import {
  createMcpToken,
  generateMcpToken,
  hashMcpToken,
  listMcpTokens,
  resolveMcpToken,
  revokeMcpToken,
} from "../functions/_shared/mcpTokens.js";

const USER = "email:alice@example.com";
const OTHER = "email:bob@example.com";

// In-memory mcp_tokens stand-in; dispatches on the SQL the module emits.
class MemoryDb {
  constructor(seed = []) {
    this.tokens = seed.map((row) => ({ ...row }));
    this.nextId = this.tokens.reduce((max, row) => Math.max(max, row.id), 0) + 1;
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
        if (sql.includes("WHERE token_hash")) {
          const [hash] = this.values;
          const row = db.tokens.find((t) => t.token_hash === hash);
          return row ? { id: row.id, user_id: row.user_id } : null;
        }
        if (sql.includes("WHERE id = ?")) {
          const [id] = this.values;
          const row = db.tokens.find((t) => t.id === id);
          return row
            ? { id: row.id, label: row.label, created_at: row.created_at, last_used_at: row.last_used_at }
            : null;
        }
        throw new Error(`Unexpected first(): ${sql}`);
      },
      async all() {
        const [userId] = this.values;
        const rows = db.tokens
          .filter((t) => t.user_id === userId)
          .map((t) => ({ id: t.id, label: t.label, created_at: t.created_at, last_used_at: t.last_used_at }));
        return { results: rows };
      },
      async run() {
        if (sql.includes("INSERT INTO mcp_tokens")) {
          const [user_id, token_hash, label] = this.values;
          const id = db.nextId++;
          db.tokens.push({
            id,
            user_id,
            token_hash,
            label: label ?? null,
            created_at: "2026-06-15 06:30:00",
            last_used_at: null,
          });
          return { meta: { last_row_id: id, changes: 1 } };
        }
        if (sql.includes("DELETE FROM mcp_tokens")) {
          const [userId, id] = this.values;
          const index = db.tokens.findIndex((t) => t.user_id === userId && t.id === id);
          if (index >= 0) db.tokens.splice(index, 1);
          return { meta: { changes: index >= 0 ? 1 : 0 } };
        }
        if (sql.includes("UPDATE mcp_tokens SET last_used_at")) {
          const [id] = this.values;
          const row = db.tokens.find((t) => t.id === id);
          if (row) row.last_used_at = "2026-06-15 07:00:00";
          return { meta: { changes: row ? 1 : 0 } };
        }
        throw new Error(`Unexpected run(): ${sql}`);
      },
    };
  }
}

test("generateMcpToken returns a prefixed token and its 64-hex-char hash", async () => {
  const a = await generateMcpToken();
  const b = await generateMcpToken();
  assert.match(a.token, /^cashly_mcp_[A-Za-z0-9_-]+$/);
  assert.match(a.tokenHash, /^[0-9a-f]{64}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(await hashMcpToken(a.token), a.tokenHash);
});

test("createMcpToken stores a token and listMcpTokens hides the secret", async () => {
  const db = new MemoryDb();
  const created = await createMcpToken(db, USER, "laptop");
  assert.match(created.token, /^cashly_mcp_/);
  assert.equal(created.label, "laptop");

  const list = await listMcpTokens(db, USER);
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].label, "laptop");
  assert.equal(list.items[0].token, undefined);
  assert.equal(list.items[0].tokenHash, undefined);
});

test("resolveMcpToken maps a valid token to its user and stamps last_used_at", async () => {
  const db = new MemoryDb();
  const created = await createMcpToken(db, USER, null);

  const resolved = await resolveMcpToken(db, created.token);
  assert.deepEqual(resolved, { userId: USER, tokenId: created.id });
  assert.equal(db.tokens[0].last_used_at, "2026-06-15 07:00:00");

  assert.equal(await resolveMcpToken(db, "cashly_mcp_wrong"), null);
  assert.equal(await resolveMcpToken(db, ""), null);
});

test("revokeMcpToken deletes the row and enforces ownership", async () => {
  const db = new MemoryDb();
  const created = await createMcpToken(db, USER, null);

  await assert.rejects(() => revokeMcpToken(db, OTHER, created.id), /not found/i);
  assert.equal(db.tokens.length, 1);

  const result = await revokeMcpToken(db, USER, created.id);
  assert.deepEqual(result, { deleted: true });
  assert.equal(db.tokens.length, 0);
  assert.equal(await resolveMcpToken(db, created.token), null);
});
