import assert from "node:assert/strict";
import test from "node:test";
import { verifyPasswordLogin } from "../functions/_shared/emailAuth.js";
import {
  consumeResetPasswordToken,
  createResetPasswordToken,
} from "../functions/_shared/passwordReset.js";

class LegacyUserDb {
  constructor(user) {
    this.user = user;
    this.writeAttempted = false;
  }

  prepare(sql) {
    const db = this;

    return {
      bind() {
        return this;
      },
      async first() {
        if (!sql.includes("FROM users")) {
          throw new Error(`Unexpected test query: ${sql}`);
        }

        return db.user;
      },
      async run() {
        db.writeAttempted = true;
        throw new Error(`Unexpected test write: ${sql}`);
      },
    };
  }
}

class MemoryResetTokenDb {
  constructor() {
    this.tokens = [];
  }

  prepare(sql) {
    const db = this;

    return {
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async run() {
        if (sql.includes("DELETE FROM password_reset_tokens")) {
          const [nowIso] = this.values;
          db.tokens = db.tokens.filter(
            (record) => !record.consumedAt && record.expiresAt > nowIso,
          );
          return { meta: { changes: 0 } };
        }

        if (sql.includes("INSERT INTO password_reset_tokens")) {
          const [email, tokenHash, expiresAt, createdAt] = this.values;
          db.tokens.push({ email, tokenHash, expiresAt, createdAt, consumedAt: null });
          return { meta: { changes: 1 } };
        }

        throw new Error(`Unexpected test query: ${sql}`);
      },
      async first() {
        if (!sql.includes("UPDATE password_reset_tokens")) {
          throw new Error(`Unexpected test query: ${sql}`);
        }

        const [consumedAt, tokenHash, nowIso] = this.values;
        const record = db.tokens.find(
          (item) =>
            item.tokenHash === tokenHash &&
            !item.consumedAt &&
            item.expiresAt > nowIso,
        );

        if (!record) {
          return null;
        }

        record.consumedAt = consumedAt;
        return { email: record.email };
      },
    };
  }
}

test("a legacy account cannot use its email address or shared app password to log in", async () => {
  const email = "legacy@example.com";
  const db = new LegacyUserDb({
    id: `email:${email}`,
    email,
    username: email,
    full_name: "Legacy User",
    password_hash: null,
  });
  const env = {
    APP_PASSWORD: "old-shared-password",
    SESSION_SECRET: "test-session-secret",
  };

  await assert.rejects(
    verifyPasswordLogin(db, env, { email, password: email }),
    /Invalid email or password/,
  );
  await assert.rejects(
    verifyPasswordLogin(db, env, { email, password: env.APP_PASSWORD }),
    /Invalid email or password/,
  );
  assert.equal(db.writeAttempted, false);
});

test("a password-reset token can be consumed only once", async () => {
  const db = new MemoryResetTokenDb();
  const env = { DB: db };
  const now = new Date("2026-07-21T10:00:00.000Z");
  const resetSession = await createResetPasswordToken(env, "user@example.com", now);

  assert.match(resetSession.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(db.tokens[0].tokenHash, resetSession.token);

  const first = await consumeResetPasswordToken(
    env,
    resetSession.token,
    new Date("2026-07-21T10:01:00.000Z"),
  );
  const replay = await consumeResetPasswordToken(
    env,
    resetSession.token,
    new Date("2026-07-21T10:02:00.000Z"),
  );

  assert.deepEqual(first, { ok: true, email: "user@example.com" });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 401);
});

test("an expired password-reset token cannot be consumed", async () => {
  const db = new MemoryResetTokenDb();
  const env = { DB: db };
  const resetSession = await createResetPasswordToken(
    env,
    "user@example.com",
    new Date("2026-07-21T10:00:00.000Z"),
  );
  const result = await consumeResetPasswordToken(
    env,
    resetSession.token,
    new Date("2026-07-21T10:16:00.000Z"),
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});
