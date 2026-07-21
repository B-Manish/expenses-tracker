import assert from "node:assert/strict";
import test from "node:test";
import { setUserPassword, verifyPasswordLogin } from "../functions/_shared/emailAuth.js";
import { hitWindow, peekWindow, clearWindow } from "../functions/_shared/rateLimit.js";

// Minimal in-memory user store: setUserPassword writes password_hash,
// verifyPasswordLogin reads it back and may rehash.
class MemoryUserDb {
  constructor(email) {
    this.user = { id: `email:${email}`, email, username: email, full_name: "T", password_hash: null };
    this.updates = 0;
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
        if (!sql.includes("FROM users")) throw new Error(`unexpected: ${sql}`);
        return db.user;
      },
      async run() {
        if (sql.includes("UPDATE users") && sql.includes("password_hash")) {
          db.user.password_hash = this.values[0];
          db.updates += 1;
          return { meta: { changes: 1 } };
        }
        throw new Error(`unexpected write: ${sql}`);
      },
    };
  }
}

// Map-backed rate_limits table.
class MemoryRateLimitDb {
  constructor() {
    this.rows = new Map();
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
        const [scope, key] = this.values;
        const value = db.rows.get(`${scope}\n${key}`);
        return value ? { value } : null;
      },
      async run() {
        if (sql.includes("INSERT INTO rate_limits")) {
          const [scope, key, value] = this.values;
          db.rows.set(`${scope}\n${key}`, value);
        } else if (sql.includes("DELETE FROM rate_limits")) {
          const [scope, key] = this.values;
          db.rows.delete(`${scope}\n${key}`);
        } else {
          throw new Error(`unexpected: ${sql}`);
        }
        return { meta: { changes: 1 } };
      },
    };
  }
}

test("PBKDF2 password hash verifies the right password and rejects the wrong one", async () => {
  const db = new MemoryUserDb("user@example.com");
  const env = { SESSION_SECRET: "test-secret" };

  await setUserPassword(db, env, "user@example.com", "correct horse battery");
  assert.match(db.user.password_hash, /pbkdf2-sha256-v1/);

  const user = await verifyPasswordLogin(db, env, {
    email: "user@example.com",
    password: "correct horse battery",
  });
  assert.equal(user.id, "email:user@example.com");

  await assert.rejects(
    verifyPasswordLogin(db, env, { email: "user@example.com", password: "wrong" }),
    /Invalid email or password/,
  );
});

test("hitWindow blocks after max attempts and clearWindow resets it", async () => {
  const db = new MemoryRateLimitDb();
  const request = { headers: { get: () => "1.2.3.4" } };
  const cfg = { windowMs: 60_000, max: 3 };

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await hitWindow(db, "t", request, cfg)).blocked, false);
  }
  const fourth = await hitWindow(db, "t", request, cfg);
  assert.equal(fourth.blocked, true);
  assert.ok(fourth.retryAfterSeconds > 0);
  assert.equal((await peekWindow(db, "t", request, cfg)).blocked, true);

  await clearWindow(db, "t", request);
  assert.equal((await peekWindow(db, "t", request, cfg)).blocked, false);
});
