# Per-User MCP Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single static `MCP_TOKEN` env secret with per-user, revocable, DB-backed MCP tokens minted from a Settings panel, so `/mcp` resolves a token to its owning `user_id` and scopes all data to that user.

**Architecture:** New `mcp_tokens` D1 table (hashed tokens). A shared `mcpTokens.js` module (generate/create/list/revoke/resolve). Three session-authenticated API endpoints under `/api/mcp/tokens`. The `/mcp` auth layer is rewritten to resolve the presented token to a `userId` via the DB and thread it into the existing dispatch (the 17 tools already take `userId`, so they are untouched). A React `McpTokens` panel added to the Settings page manages tokens.

**Tech Stack:** Cloudflare Pages Functions (Workers runtime), D1, Zod, `node:test`. React 19 + Vite frontend. No new dependencies.

## Global Constraints

- **No new dependencies.**
- **ES modules**, `"type": "module"`; relative import paths end in `.js`.
- **Identity:** in the `/mcp` path the `userId` comes ONLY from resolving the presented token against `mcp_tokens`; never hardcode `DEFAULT_USER_ID`. In the token API endpoints the `userId` comes ONLY from `getSessionUserId(auth.session)`; never from a request field.
- **Token format:** `cashly_mcp_` + base64url(32 random bytes). Store only `sha256hex(token)`. Plaintext returned exactly once (on create). Revoke = `DELETE` the row.
- **Remove the static `MCP_TOKEN`** env-secret auth path entirely (auth.js, index.js, tests, docs, `.dev.vars`).
- **Tests** live in `test/*.test.js`, use `node:test` + `node:assert/strict`, hand-written SQL-dispatching DB stubs (mirror `test/budgets.test.js`), run with `npm test`.
- **Frontend** has no test runner in this repo; verify UI changes with `npm run build` and `npm run lint`.
- **Migration `0018` must be applied** locally (`npx wrangler d1 migrations apply DB --local`) and remotely before the deployed `/mcp` works.

---

## File Structure

- Create `migrations/0018_mcp_tokens.sql` — the table.
- Create `functions/_shared/mcpTokens.js` — generate/hash/create/list/revoke/resolve + validators.
- Create `functions/api/mcp/tokens/index.js` — GET (list), POST (create).
- Create `functions/api/mcp/tokens/[id].js` — DELETE (revoke).
- Modify `functions/_shared/mcp/auth.js` — DB-backed `requireMcpAuthorization(request, db)`.
- Modify `functions/mcp/index.js` — resolve db once, auth via db, use resolved `userId`.
- Modify `test/mcp.test.js` — rewrite the auth block + the endpoint block for the new model.
- Create `test/mcpTokens.test.js` — module unit tests.
- Modify `src/services/api.js` — 3 client methods.
- Create `src/components/McpTokens.jsx` — the Settings panel.
- Modify `src/pages/Settings.jsx` — mount `<McpTokens />`.
- Modify `docs/MCP.md`, `DEPLOYMENT_SYNC_GUIDE.md` — per-user token instructions; drop the env secret.

---

### Task 1: Migration + token module

**Files:**
- Create: `migrations/0018_mcp_tokens.sql`
- Create: `functions/_shared/mcpTokens.js`
- Test: `test/mcpTokens.test.js`

**Interfaces:**
- Produces:
  - `generateMcpToken()` → `Promise<{ token: string, tokenHash: string }>`
  - `hashMcpToken(token)` → `Promise<string>` (SHA-256 hex)
  - `createMcpToken(db, userId, label)` → `Promise<{ id, token, label, createdAt, lastUsedAt }>` (`token` = one-time plaintext)
  - `listMcpTokens(db, userId)` → `Promise<{ items: Array<{ id, label, createdAt, lastUsedAt }> }>`
  - `revokeMcpToken(db, userId, id)` → `Promise<{ deleted: true }>` (throws `notFound` if absent/unowned)
  - `resolveMcpToken(db, token)` → `Promise<{ userId, tokenId } | null>`
  - `validateMcpTokenLabel(input)` / `validateMcpTokenId(input)` → `{ ok, data, error, response }`

- [ ] **Step 1: Write the migration**

Create `migrations/0018_mcp_tokens.sql`:

```sql
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON mcp_tokens(user_id);
```

- [ ] **Step 2: Write the failing test**

Create `test/mcpTokens.test.js`:

```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../functions/_shared/mcpTokens.js`.

- [ ] **Step 4: Write the module**

Create `functions/_shared/mcpTokens.js`:

```js
import { z } from "zod";
import { notFound } from "./errors.js";
import { idSchema, validate } from "./validation.js";

const TOKEN_PREFIX = "cashly_mcp_";
const TOKEN_BYTES = 32;
const MAX_LABEL_LENGTH = 80;
const encoder = new TextEncoder();

const labelSchema = z
  .preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .trim()
      .max(MAX_LABEL_LENGTH, `Label must be ${MAX_LABEL_LENGTH} characters or less`)
      .optional(),
  )
  .transform((value) => value ?? null);

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashMcpToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export async function generateMcpToken() {
  const random = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  const token = `${TOKEN_PREFIX}${bytesToBase64Url(random)}`;
  return { token, tokenHash: await hashMcpToken(token) };
}

export function validateMcpTokenLabel(input) {
  return validate(labelSchema, input);
}

export function validateMcpTokenId(input) {
  return validate(idSchema, input);
}

function mapTokenRow(row) {
  return {
    id: row.id,
    label: row.label ?? null,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? null,
  };
}

export async function listMcpTokens(db, userId) {
  const rows = await db
    .prepare(`
      SELECT id, label, created_at, last_used_at
      FROM mcp_tokens
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
    `)
    .bind(userId)
    .all();

  return { items: (rows.results || []).map(mapTokenRow) };
}

export async function createMcpToken(db, userId, label) {
  const { token, tokenHash } = await generateMcpToken();
  const result = await db
    .prepare("INSERT INTO mcp_tokens (user_id, token_hash, label) VALUES (?, ?, ?)")
    .bind(userId, tokenHash, label)
    .run();

  const id = result.meta?.last_row_id;
  const row = await db
    .prepare("SELECT id, label, created_at, last_used_at FROM mcp_tokens WHERE id = ?")
    .bind(id)
    .first();

  return { ...mapTokenRow(row), token };
}

export async function revokeMcpToken(db, userId, id) {
  const result = await db
    .prepare("DELETE FROM mcp_tokens WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .run();

  if (!result.meta?.changes) {
    throw notFound("Token not found");
  }

  return { deleted: true };
}

export async function resolveMcpToken(db, token) {
  if (typeof token !== "string" || !token) {
    return null;
  }

  const tokenHash = await hashMcpToken(token);
  const row = await db
    .prepare("SELECT id, user_id FROM mcp_tokens WHERE token_hash = ?")
    .bind(tokenHash)
    .first();

  if (!row) {
    return null;
  }

  // ponytail: best-effort last-used stamp on every resolve; a write failure here
  // must never block the MCP request. Throttle only if write volume matters.
  try {
    await db
      .prepare("UPDATE mcp_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(row.id)
      .run();
  } catch {
    // ignore
  }

  return { userId: row.user_id, tokenId: row.id };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (4 new mcpTokens tests + existing suite).

- [ ] **Step 6: Commit**

```bash
git add migrations/0018_mcp_tokens.sql functions/_shared/mcpTokens.js test/mcpTokens.test.js
git commit -m "feat(mcp): mcp_tokens table and token module (generate/create/list/revoke/resolve)"
```

---

### Task 2: DB-backed MCP auth + endpoint wiring + test rewrite

**Files:**
- Modify: `functions/_shared/mcp/auth.js`
- Modify: `functions/mcp/index.js`
- Modify: `test/mcp.test.js`

**Interfaces:**
- Consumes: `resolveMcpToken` from `../mcpTokens.js` (Task 1).
- Produces: `requireMcpAuthorization(request, db)` → `Promise<{ ok: true, userId } | { ok: false, status, message }>`. `onRequest` now scopes dispatch to the resolved `userId`.

- [ ] **Step 1: Rewrite the auth module**

Replace the entire contents of `functions/_shared/mcp/auth.js` with:

```js
import { resolveMcpToken } from "../mcpTokens.js";

function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());

  return match ? match[1].trim() : null;
}

export async function requireMcpAuthorization(request, db) {
  const presented = getBearerToken(request);

  if (!presented) {
    return { ok: false, status: 401, message: "Authentication required" };
  }

  const resolved = await resolveMcpToken(db, presented);

  if (!resolved) {
    return { ok: false, status: 401, message: "Authentication required" };
  }

  return { ok: true, userId: resolved.userId };
}
```

- [ ] **Step 2: Rewrite the endpoint**

Replace the entire contents of `functions/mcp/index.js` with:

```js
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
  const { request } = context;

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  try {
    const db = requireDb(context);
    const auth = await requireMcpAuthorization(request, db);

    if (!auth.ok) {
      return jsonResponse(rpcErrorBody(-32001, auth.message), auth.status);
    }

    let message;

    try {
      message = JSON.parse(await request.text());
    } catch {
      return jsonResponse(rpcErrorBody(-32700, "Parse error"), 200);
    }

    const response = await handleRpc(message, {
      db,
      userId: auth.userId,
      tools,
      now: new Date(),
    });

    if (response === null) {
      return new Response(null, { status: 202 });
    }

    return jsonResponse(response, 200);
  } catch {
    return jsonResponse(rpcErrorBody(-32603, "Internal error"), 500);
  }
}
```

- [ ] **Step 3: Rewrite the auth test block in `test/mcp.test.js`**

Replace lines 3–35 (the `requireMcpAuthorization` import and its four `MCP_TOKEN` tests) with:

```js
import { requireMcpAuthorization } from "../functions/_shared/mcp/auth.js";
import { hashMcpToken } from "../functions/_shared/mcpTokens.js";

function req(headers = {}) {
  return new Request("https://tracker.example/mcp", { method: "POST", headers });
}

// Stub DB that resolves one known token hash to a user (matches resolveMcpToken's queries).
function tokenDb(knownHash, userId) {
  return {
    prepare(sql) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          const [hash] = this.values;
          return sql.includes("token_hash") && hash === knownHash ? { id: 1, user_id: userId } : null;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

test("requireMcpAuthorization rejects a missing Authorization header", async () => {
  const result = await requireMcpAuthorization(req(), tokenDb("x", "u"));
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("requireMcpAuthorization rejects an unknown token", async () => {
  const result = await requireMcpAuthorization(req({ authorization: "Bearer nope" }), tokenDb("x", "u"));
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("requireMcpAuthorization resolves a valid token to its user", async () => {
  const token = "cashly_mcp_valid";
  const db = tokenDb(await hashMcpToken(token), "email:alice@example.com");
  const result = await requireMcpAuthorization(req({ authorization: `Bearer ${token}` }), db);
  assert.equal(result.ok, true);
  assert.equal(result.userId, "email:alice@example.com");
});
```

- [ ] **Step 4: Rewrite the endpoint test block in `test/mcp.test.js`**

Replace lines 261–320 (the `onRequest` import, the `MCP_TOKEN` const, the `mcpContext` helper, and the five endpoint tests) with the following. Note `RowsDb` is declared later in the file but is only referenced inside these functions when they run (after the module fully evaluates), so this is safe:

```js
import { onRequest } from "../functions/mcp/index.js";

// Endpoint DB stub: resolves the presented token to a user, then answers the tool query.
function mcpEndpointDb({ tokenUserId = "phone:9949055750", txns = [txnRow(2)] } = {}) {
  return new RowsDb([
    {
      match: "mcp_tokens",
      first: () => (tokenUserId ? { id: 1, user_id: tokenUserId } : null),
      run: () => ({ meta: { changes: 1 } }),
    },
    {
      match: "FROM transactions",
      first: () => ({ total: txns.length }),
      all: (values) => {
        const offset = values[values.length - 1];
        const limit = values[values.length - 2];
        return { results: txns.slice(offset, offset + limit) };
      },
    },
  ]);
}

function mcpContext(bodyObject, { token = "cashly_mcp_test", tokenUserId = "phone:9949055750" } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const request = new Request("https://tracker.example/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(bodyObject),
  });
  return { request, env: { DB: mcpEndpointDb({ tokenUserId }) } };
}

test("onRequest rejects non-POST with 405", async () => {
  const response = await onRequest({
    request: new Request("https://tracker.example/mcp", { method: "GET" }),
    env: {},
  });
  assert.equal(response.status, 405);
});

test("onRequest rejects a missing bearer token with 401", async () => {
  const ctx = mcpContext({ jsonrpc: "2.0", id: 1, method: "ping" }, { token: null });
  const response = await onRequest(ctx);
  assert.equal(response.status, 401);
});

test("onRequest rejects an unknown token with 401", async () => {
  const ctx = mcpContext({ jsonrpc: "2.0", id: 1, method: "ping" }, { tokenUserId: null });
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

test("onRequest scopes queries to the token's user", async () => {
  let capturedUserId = null;
  const db = new RowsDb([
    { match: "mcp_tokens", first: () => ({ id: 1, user_id: "email:alice@example.com" }), run: () => ({ meta: {} }) },
    {
      match: "FROM transactions",
      first: (values) => {
        capturedUserId = values[0];
        return { total: 0 };
      },
      all: () => ({ results: [] }),
    },
  ]);
  const request = new Request("https://tracker.example/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer cashly_mcp_alice" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_transactions", arguments: {} } }),
  });
  const response = await onRequest({ request, env: { DB: db } });
  assert.equal(response.status, 200);
  assert.equal(capturedUserId, "email:alice@example.com");
});

test("onRequest returns 202 with no body for a notification", async () => {
  const ctx = mcpContext({ jsonrpc: "2.0", method: "notifications/initialized" });
  const response = await onRequest(ctx);
  assert.equal(response.status, 202);
});

test("onRequest returns a parse error for invalid JSON", async () => {
  const request = new Request("https://tracker.example/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer cashly_mcp_test" },
    body: "{ not json",
  });
  const response = await onRequest({ request, env: { DB: mcpEndpointDb({}) } });
  const body = await response.json();
  assert.equal(body.error.code, -32700);
});
```

- [ ] **Step 5: Update the DB-missing test**

Near the end of `test/mcp.test.js`, the test `"onRequest returns a JSON-RPC internal error when the DB binding is missing"` still references the removed `MCP_TOKEN` const in its header. Change its Authorization header line from `` `Bearer ${MCP_TOKEN}` `` to the literal `"Bearer cashly_mcp_test"`:

```js
    headers: { "content-type": "application/json", authorization: "Bearer cashly_mcp_test" },
```

(The test still sends `env: { MCP_TOKEN }` with no DB — change that to `env: {}` so `requireDb` throws and the handler returns `-32603`.)

```js
  const response = await onRequest({ request, env: {} }); // env has no DB
```

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: PASS. Confirm no test still references `MCP_TOKEN` (grep: `git grep -n MCP_TOKEN test/mcp.test.js` returns nothing).

- [ ] **Step 7: Lint + commit**

Run: `npm run lint` (expect clean), then:

```bash
git add functions/_shared/mcp/auth.js functions/mcp/index.js test/mcp.test.js
git commit -m "feat(mcp): resolve per-user tokens at /mcp; drop the static MCP_TOKEN"
```

---

### Task 3: Token management API endpoints

**Files:**
- Create: `functions/api/mcp/tokens/index.js`
- Create: `functions/api/mcp/tokens/[id].js`

**Interfaces:**
- Consumes: `requireAuth`, `getSessionUserId` (`_shared/auth.js`); `createApiHandler`, `parseJsonBody` (`_shared/http.js`); `success` (`_shared/json.js`); `requireDb` (`_shared/db.js`); `createMcpToken`, `listMcpTokens`, `revokeMcpToken`, `validateMcpTokenId`, `validateMcpTokenLabel` (`_shared/mcpTokens.js`).
- Produces: `GET/POST /api/mcp/tokens`, `DELETE /api/mcp/tokens/:id`.

These are thin wrappers over the Task-1 module (which is unit-tested) and exactly mirror `functions/api/saved-views/`. No endpoint-level test is added — consistent with the repo, where resource endpoints are covered through their `_shared` module tests.

- [ ] **Step 1: Write the collection endpoint**

Create `functions/api/mcp/tokens/index.js`:

```js
import { getSessionUserId, requireAuth } from "../../../_shared/auth.js";
import { requireDb } from "../../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../../_shared/http.js";
import { success } from "../../../_shared/json.js";
import {
  createMcpToken,
  listMcpTokens,
  validateMcpTokenLabel,
} from "../../../_shared/mcpTokens.js";

async function requireAuthenticatedRequest(context) {
  const auth = await requireAuth(context);

  return auth.authenticated ? auth : { response: auth.response };
}

export const onRequest = createApiHandler({
  async GET(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    return success(
      await listMcpTokens(requireDb(context), getSessionUserId(auth.session)),
    );
  },

  async POST(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    const body = await parseJsonBody(context.request, { required: false });
    const validation = validateMcpTokenLabel(body?.label);

    if (!validation.ok) {
      return validation.response;
    }

    return success(
      await createMcpToken(requireDb(context), getSessionUserId(auth.session), validation.data),
      201,
    );
  },
});
```

Note: `parseJsonBody(request, { required: false })` allows an empty body (label is optional). `validateMcpTokenLabel` accepts `undefined`/empty → `null`.

- [ ] **Step 2: Write the item endpoint**

Create `functions/api/mcp/tokens/[id].js`:

```js
import { getSessionUserId, requireAuth } from "../../../_shared/auth.js";
import { requireDb } from "../../../_shared/db.js";
import { createApiHandler } from "../../../_shared/http.js";
import { success } from "../../../_shared/json.js";
import { revokeMcpToken, validateMcpTokenId } from "../../../_shared/mcpTokens.js";

async function requireAuthenticatedRequest(context) {
  const auth = await requireAuth(context);

  return auth.authenticated ? auth : { response: auth.response };
}

export const onRequest = createApiHandler({
  async DELETE(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    const idValidation = validateMcpTokenId(context.params?.id);

    if (!idValidation.ok) {
      return idValidation.response;
    }

    return success(
      await revokeMcpToken(requireDb(context), getSessionUserId(auth.session), idValidation.data),
    );
  },
});
```

- [ ] **Step 3: Verify import depth**

The endpoints live at `functions/api/mcp/tokens/`, so `_shared` is **three** levels up (`../../../_shared/...`). Confirm by running the suite (it imports nothing here) and, if wrangler dev is running, `curl` the endpoint in Task 5. Run `npm run lint` to catch a wrong path.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add functions/api/mcp/tokens/index.js functions/api/mcp/tokens/[id].js
git commit -m "feat(mcp): session-authenticated token management endpoints"
```

---

### Task 4: Settings UI — token management panel

**Files:**
- Modify: `src/services/api.js`
- Create: `src/components/McpTokens.jsx`
- Modify: `src/pages/Settings.jsx`

**Interfaces:**
- Consumes: `/api/mcp/tokens` endpoints (Task 3); existing `ApiError`, `Button`, `Input`, `LoadingState`, `ErrorState`, `ConfirmDialog`, `getErrorMessage`.
- Produces: `api.getMcpTokens/createMcpToken/revokeMcpToken`; `<McpTokens />` mounted in Settings.

- [ ] **Step 1: Add the API client methods**

In `src/services/api.js`, add these three entries to the `api` object (place them after the `getSavedViews`/`deleteSavedView` block for grouping):

```js
  getMcpTokens: () => request("/api/mcp/tokens"),
  createMcpToken: (label) => jsonRequest("/api/mcp/tokens", "POST", { label }),
  revokeMcpToken: (id) => request(`/api/mcp/tokens/${id}`, { method: "DELETE" }),
```

- [ ] **Step 2: Create the panel component**

Create `src/components/McpTokens.jsx`:

```jsx
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../services/api.js";
import { getErrorMessage } from "../utils/validation.js";
import ConfirmDialog from "./ConfirmDialog.jsx";
import ErrorState from "./ErrorState.jsx";
import LoadingState from "./LoadingState.jsx";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";

export default function McpTokens() {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "loading", error: "", items: [] });
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newToken, setNewToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState("");

  const handle401 = useCallback(
    (error) => {
      if (error instanceof ApiError && error.status === 401) {
        navigate("/login", {
          replace: true,
          state: { notice: "Please log in again to manage MCP tokens." },
        });
        return true;
      }
      return false;
    },
    [navigate],
  );

  const load = useCallback(async () => {
    setState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const data = await api.getMcpTokens();
      setState({ status: "ready", error: "", items: data.items ?? [] });
    } catch (error) {
      if (handle401(error)) return;
      setState({ status: "error", error: getErrorMessage(error, "Tokens could not be loaded."), items: [] });
    }
  }, [handle401]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    setNewToken("");
    setCopied(false);
    try {
      const created = await api.createMcpToken(label.trim() || undefined);
      setNewToken(created.token);
      setLabel("");
      await load();
    } catch (error) {
      if (handle401(error)) return;
      setCreateError(getErrorMessage(error, "Token could not be created."));
    } finally {
      setCreating(false);
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function confirmRevoke() {
    if (!pendingRevoke) return;
    setRevoking(true);
    setRevokeError("");
    try {
      await api.revokeMcpToken(pendingRevoke.id);
      setPendingRevoke(null);
      await load();
    } catch (error) {
      if (handle401(error)) return;
      setRevokeError(getErrorMessage(error, "Token could not be revoked."));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="mcp-tokens-title">
      <div className="panel-header">
        <div>
          <h2 id="mcp-tokens-title">MCP Access</h2>
          <p>Personal tokens for MCP clients (Claude Code, Cursor, Codex). Each grants full access to your data.</p>
        </div>
      </div>

      <form className="settings-form" onSubmit={handleCreate}>
        <label className="form-field">
          <span>
            <KeyRound size={16} aria-hidden="true" />
            Token name (optional)
          </span>
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. Claude Code laptop"
            maxLength={80}
            disabled={creating}
          />
        </label>
        {createError ? <p className="form-error" role="alert">{createError}</p> : null}
        <div className="form-actions">
          <Button type="submit" disabled={creating}>
            <Plus size={18} aria-hidden="true" />
            {creating ? "Generating" : "Generate token"}
          </Button>
        </div>
      </form>

      {newToken ? (
        <div className="rounded-md border border-dashed p-3" role="status">
          <p className="success-message">Copy this token now — it is shown only once.</p>
          <code className="readonly-value block break-all">{newToken}</code>
          <div className="form-actions">
            <Button type="button" variant="outline" onClick={copyToken}>
              <Copy size={18} aria-hidden="true" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}

      {state.status === "loading" ? (
        <LoadingState title="Loading tokens" message="Fetching your MCP tokens." />
      ) : null}
      {state.status === "error" ? (
        <ErrorState title="Tokens unavailable" message={state.error} actionLabel="Retry" onRetry={load} />
      ) : null}
      {state.status === "ready" && state.items.length === 0 ? (
        <p className="field-hint">No tokens yet. Generate one to connect an MCP client.</p>
      ) : null}
      {state.status === "ready" && state.items.length > 0 ? (
        <ul className="grid gap-2">
          {state.items.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="grid gap-1">
                <strong>{token.label || "Unnamed token"}</strong>
                <span className="field-hint">
                  Created {token.createdAt}
                  {token.lastUsedAt ? ` · last used ${token.lastUsedAt}` : " · never used"}
                </span>
              </div>
              <Button type="button" variant="destructive" onClick={() => setPendingRevoke(token)}>
                <Trash2 size={18} aria-hidden="true" />
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingRevoke)}
        title="Revoke token?"
        message={`This immediately disables "${pendingRevoke?.label || "Unnamed token"}". Any client using it stops working.`}
        confirmLabel="Revoke"
        error={revokeError}
        isBusy={revoking}
        onCancel={() => {
          setPendingRevoke(null);
          setRevokeError("");
        }}
        onConfirm={confirmRevoke}
      />
    </section>
  );
}
```

- [ ] **Step 3: Mount the panel in Settings**

In `src/pages/Settings.jsx`:

Add the import near the other component imports (after `import PageHeader from "../components/PageHeader.jsx";`):

```jsx
import McpTokens from "../components/McpTokens.jsx";
```

Then render `<McpTokens />` between the Preferences panel and the Session panel — insert it immediately before the `<section className="panel danger-panel narrow-section" ...>` (Session) block:

```jsx
      <McpTokens />

      <section className="panel danger-panel narrow-section" aria-labelledby="session-title">
```

- [ ] **Step 4: Build and lint**

Run: `npm run build`
Expected: build succeeds, no errors.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/services/api.js src/components/McpTokens.jsx src/pages/Settings.jsx
git commit -m "feat(mcp): Settings panel to generate, list, and revoke MCP tokens"
```

---

### Task 5: Docs, config, and local verification

**Files:**
- Modify: `docs/MCP.md`
- Modify: `DEPLOYMENT_SYNC_GUIDE.md`
- (local only) `.dev.vars`

**Interfaces:** none (docs/config).

- [ ] **Step 1: Rewrite `docs/MCP.md`**

Replace the "Auth" and "Connect a client" sections so they describe per-user tokens. The file should read:

```markdown
# MCP Server

The app exposes a remote MCP server at `POST /mcp` so MCP clients (Claude Code,
Cursor, Codex) can query and manage **your** expenses in natural language.

## Auth

Each user generates their own token in the app: **Settings → MCP Access →
Generate token**. The token is shown once — copy it immediately. It is sent as
`Authorization: Bearer <token>` and scopes the MCP server to that user's data.
Treat it like a password: it grants full read/write access to your finances.
Revoke a token any time from the same screen (revocation is immediate).

There is no shared server-wide token; tokens are per-user and stored hashed.

## Connect a client

Claude Code:

```bash
claude mcp add --transport http cashly https://tracker.manishbatchu.com/mcp \
  --header "Authorization: Bearer <your-token>"
```

Cursor / Codex: add an MCP server entry with the URL
`https://tracker.manishbatchu.com/mcp` and an `Authorization: Bearer <your-token>`
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

- [ ] **Step 2: Update `DEPLOYMENT_SYNC_GUIDE.md`**

1. **Remove the `MCP_TOKEN` runtime secret** (added by the previous feature): delete the `| \`MCP_TOKEN\` | ... |` row from the runtime-secrets table, the `MCP_TOKEN=...` line from the `.dev.vars` example block, and `MCP_TOKEN` from the production-secrets list. MCP auth is now DB-backed, not an env secret.

2. **Add migration `0018`** to the "Database Schema Sync" section's list of migrations / tables: note `migrations/0018_mcp_tokens.sql` creates the `mcp_tokens` table, and that it must be applied locally and remotely:

```bash
npx wrangler d1 migrations apply DB --local
npx wrangler d1 migrations apply DB --remote
```

3. **Update the Production Verification Checklist** `/mcp` lines to:

```markdown
- A token generated in Settings → MCP Access authenticates `POST /mcp` (`initialize` returns a result).
- A revoked or unknown token returns 401 from `POST /mcp`.
```

- [ ] **Step 3: Remove the local static secret (operator step)**

Delete the `MCP_TOKEN=...` line from `.dev.vars` (it is no longer read). Not committed (`.dev.vars` is gitignored).

- [ ] **Step 4: Apply the migration locally and smoke-test (operator step)**

```bash
npx wrangler d1 migrations apply DB --local
npm run build
npx wrangler pages dev dist
```

In a second terminal (session cookie needed for the token API — easiest is to generate the token via the Settings UI in the browser, then):

```bash
curl.exe -s -X POST http://localhost:8788/mcp `
  -H "authorization: Bearer <token-from-settings>" `
  -H "content-type: application/json" `
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}'
# Expect: result.serverInfo.name = "cashly-expenses"
```

A revoked/unknown token must return HTTP 401.

- [ ] **Step 5: Commit docs**

```bash
git add docs/MCP.md DEPLOYMENT_SYNC_GUIDE.md
git commit -m "docs(mcp): per-user token setup; drop the static MCP_TOKEN secret"
```

---

## Self-Review

**Spec coverage:**
- `mcp_tokens` table (hashed, revoke=delete, no expiry) → Task 1. ✔
- Token format `cashly_mcp_` + base64url(32 bytes), SHA-256 hash stored → Task 1. ✔
- Module: generate/hash/create/list/revoke/resolve + validators, best-effort last_used → Task 1. ✔
- 3 session-auth endpoints mirroring saved-views → Task 3. ✔
- `/mcp` auth rewrite `requireMcpAuthorization(request, db)`; static token removed; userId from token → Task 2. ✔
- index.js resolves db once, dispatches with resolved userId, keeps -32603 hardening → Task 2. ✔
- Test rewrite (auth block + endpoint block) + new per-user-scoping test + mcpTokens unit tests → Tasks 1–2. ✔
- Settings panel + api methods + Settings wiring → Task 4. ✔
- Docs/config: MCP.md rewrite, drop MCP_TOKEN secret, add migration, verify → Task 5. ✔
- Out of scope (expiry, sudo re-prompt, rate limiting, admin view) — not built. ✔

**Placeholder scan:** No TBD/TODO; every code step contains complete code. `<your-token>` / `<token-from-settings>` in docs are intentional reader placeholders.

**Type consistency:** `requireMcpAuthorization(request, db)` (Task 2) matches its test (Task 2) and index.js caller (Task 2). `resolveMcpToken(db, token) → {userId, tokenId}|null` (Task 1) consumed by auth (Task 2). `createMcpToken → {id, token, label, createdAt, lastUsedAt}` (Task 1) consumed by the endpoint (Task 3) and the UI (Task 4, reads `created.token`). `listMcpTokens → {items:[{id,label,createdAt,lastUsedAt}]}` consumed by the UI list (Task 4). `revokeMcpToken(db, userId, id)` (Task 1) consumed by `[id].js` (Task 3). Endpoint import depth is `../../../_shared` (three levels) — Task 3 Step 3 verifies.

**Note:** Task 2 modifies already-passing tests from the prior feature (the static-token model) — this is intentional per the spec, not additive-only.
