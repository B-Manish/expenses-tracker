# Per-User MCP Tokens — Design

**Date:** 2026-07-22
**Status:** Approved for planning
**Builds on:** [2026-07-22-expense-tracker-mcp-server-design.md](2026-07-22-expense-tracker-mcp-server-design.md) (branch `feature/mcp-server`)

## Goal

Make the MCP server multi-user. Each logged-in user generates their own MCP
access token from the app; the `/mcp` endpoint resolves a presented token to its
owning `user_id` and scopes all tools to that user's data. Replaces the single
static `MCP_TOKEN` env secret (never deployed) with per-user, revocable,
DB-backed tokens.

## Context (verified in code)

The app is genuinely multi-user: `verifyPasswordLogin` (emailAuth.js) resolves a
user by email; `createSessionCookie(request, env, user.id)` stores the real
`user.id` in the session; signup creates `email:<email>` users each seeded with
their own categories/payment-methods/settings; every data table is scoped by
`user_id`. `DEFAULT_USER_ID = "phone:9949055750"` is only the legacy owner.

The current MCP server hardcodes `DEFAULT_USER_ID`, so it always reads the legacy
owner's data regardless of who holds the token. This design fixes that. The 17
tools already thread `userId` through every `_shared` call, so **no tool code
changes** — only the auth/identity layer changes.

## Decisions

- **Storage:** hashed tokens in a new `mcp_tokens` D1 table (revocable, listable).
- **Management UX:** a panel in the existing **Settings** page + 3 API endpoints.
- **Static token:** removed entirely. Per-user DB tokens are the only auth path.
- **Revoke = delete the row.** No `revoked_at`/expiry columns (YAGNI).
- **No password re-prompt** to mint (session login is sufficient for v1).

## Data model — migration `0018_mcp_tokens.sql`

```sql
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,   -- SHA-256 hex of the token; plaintext never stored
  label TEXT,                         -- optional, e.g. "Claude Code laptop"
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON mcp_tokens(user_id);
```

`token_hash` is `UNIQUE` and is the lookup key for `/mcp` auth. Migration must be
applied locally and remotely (`0018` is a new schema change).

## Token format

`cashly_mcp_` + base64url(32 random bytes). Prefix aids recognition and secret
scanning. 32 bytes of entropy means SHA-256 lookup-by-hash is safe: no slow hash
and no constant-time compare are required (those matter for low-entropy
passwords, not for a random 256-bit secret). Only the SHA-256 hash is stored; the
plaintext is shown to the user exactly once and is unrecoverable afterward.

## Shared module `functions/_shared/mcpTokens.js`

- `generateMcpToken()` → `{ token, tokenHash }`. `token` is the prefixed
  plaintext; `tokenHash` is `sha256hex(token)`.
- `hashMcpToken(token)` → `Promise<string>` (SHA-256 hex). Reuses the Web Crypto
  pattern already used across the codebase.
- `createMcpToken(db, userId, label)` → inserts a row, returns
  `{ id, token, label, createdAt }`. `token` (plaintext) is present **only** on
  this create response, never elsewhere.
- `listMcpTokens(db, userId)` → `{ items: [{ id, label, createdAt, lastUsedAt }] }`.
  Never returns `token_hash` or plaintext.
- `revokeMcpToken(db, userId, id)` → `DELETE ... WHERE user_id = ? AND id = ?`;
  throws `notFound` when the row is absent or not owned. Returns `{ deleted: true }`.
- `resolveMcpToken(db, token)` → hash the presented token, select the row by
  `token_hash`; if found, best-effort `UPDATE ... SET last_used_at =
  CURRENT_TIMESTAMP` (failure to update never fails the request), and return
  `{ userId, tokenId }`; else return `null`.
- Validation helpers: `validateMcpTokenLabel` (optional string, trimmed, ≤80
  chars) and `validateMcpTokenId` (reuse `idSchema`).

`ponytail:` `last_used_at` is written on every resolve (one D1 write per MCP
request). Fine at personal scale; throttle (e.g. once/hour) only if write volume
becomes a concern.

## API endpoints (session-cookie auth, mirror `saved-views`)

All use `createApiHandler`, `requireAuth(context)`, and
`getSessionUserId(auth.session)`. Responses use `success(data, status)`.

- `functions/api/mcp/tokens/index.js`
  - `GET` → `success(await listMcpTokens(db, userId))`.
  - `POST {label?}` → validate label → `success(await createMcpToken(db, userId,
    label), 201)`. The 201 body includes the one-time plaintext `token`.
- `functions/api/mcp/tokens/[id].js`
  - `DELETE` → validate `context.params.id` → `success(await revokeMcpToken(db,
    userId, id))`.

## MCP auth rewrite

- `functions/_shared/mcp/auth.js`: `requireMcpAuthorization(request, db)`
  (`env` param dropped — no longer needed; auth is now DB-backed):
  - No bearer token → `{ ok: false, status: 401, message: "Authentication required" }`.
  - `resolveMcpToken(db, token)` returns null → same 401.
  - Otherwise → `{ ok: true, userId }`.
  - The `env.MCP_TOKEN` / min-32-char / sha256-vs-env path is **deleted**.
- `functions/mcp/index.js`:
  - Method guard (405) unchanged.
  - Resolve `db = requireDb(context)` once (inside the existing try/catch so an
    unbound DB still returns a JSON-RPC `-32603`).
  - `const auth = await requireMcpAuthorization(request, db)`; on failure
    return the JSON-RPC-shaped error at `auth.status`.
  - Parse body (`-32700` on failure) as today.
  - Dispatch with `userId: auth.userId` (remove the `MCP_USER_ID` /
    `DEFAULT_USER_ID` resolution and its import).

## Test updates (`test/mcp.test.js`)

The existing suite asserts the static-token model and must be updated, not just
extended:

- **Auth tests (Task 1 block):** rewrite to exercise `requireMcpAuthorization(request,
  db)` against a small stub `db` seeded with a known `token_hash`. Cases:
  no header → 401; unknown token → 401; matching token → `{ ok: true, userId }`.
  Drop the "MCP_TOKEN not configured → 500" case (no longer applicable).
- **Endpoint tests (Task 5 block):** the `env.MCP_TOKEN` fixtures are replaced;
  the stub `env.DB` must answer both the token-resolution query and the tool
  query. Construct a combined stub (or extend `TxnPagingDb`) that returns a token
  row for the `mcp_tokens` lookup and transaction rows for the tool call. Assert
  the resolved user scopes correctly (a token for user A returns user A's data).
- **New `mcpTokens.js` unit tests** (a separate `test/mcpTokens.test.js`,
  matching the repo's per-module test convention): `generateMcpToken` shape +
  prefix; `createMcpToken`/`listMcpTokens`/`revokeMcpToken`/`resolveMcpToken`
  against a MemoryDb stub (mirror `test/budgets.test.js` style); ownership
  scoping (user B cannot revoke user A's token; resolve touches `last_used_at`).

## Frontend

- `src/services/api.js` — add:
  - `getMcpTokens: () => request("/api/mcp/tokens")`
  - `createMcpToken: (label) => jsonRequest("/api/mcp/tokens", "POST", { label })`
  - `revokeMcpToken: (id) => request(\`/api/mcp/tokens/${id}\`, { method: "DELETE" })`
- `src/components/McpTokens.jsx` — a self-contained panel (keeps `Settings.jsx`
  from growing): loads and lists tokens (label, created, last-used, Revoke
  button using the existing `ConfirmDialog`), a "Generate token" form (optional
  label), and a one-time reveal block for a newly created token (monospace value,
  Copy button, "This token is shown once — copy it now" warning). Uses the
  existing `Button`, `LoadingState`, `ErrorState`, `PageHeader`/`panel` styles,
  and `ApiError` 401 → redirect-to-login pattern already used in `Settings.jsx`.
- `src/pages/Settings.jsx` — mount `<McpTokens />` as a new `panel` section
  between Preferences and Session. No new route.

## Docs / config

- `docs/MCP.md` — replace the static-token instructions: users generate a token
  in **Settings → MCP Access**; the `claude mcp add` / client examples use that
  personal token. Note it grants full read/write to that user's finances and is
  shown once.
- `DEPLOYMENT_SYNC_GUIDE.md` — remove the `MCP_TOKEN` runtime-secret row and its
  `.dev.vars` / production-secret entries (added in the prior feature's Task 6);
  add `migrations/0018_mcp_tokens.sql` to the schema-sync section; update the
  verification checklist: "mint a token in Settings → `/mcp` `initialize`
  succeeds with it; a revoked/unknown token → 401".
- Remove `MCP_TOKEN` from local `.dev.vars` (operator step; it's no longer read).

## Out of scope (v1)

- Token expiry, rotation reminders, per-token scopes/permissions.
- Password re-prompt (sudo mode) before minting.
- Rate limiting on `/mcp` beyond what the token lookup provides.
- Admin view of all users' tokens.

## Security notes

- Plaintext token shown exactly once; only SHA-256 hash persisted.
- Revocation is immediate (row deleted → no matching hash on the next request).
- Minting is gated by an authenticated session; a token is bound to the session's
  `user_id` at creation and cannot be created for another user.
- `resolveMcpToken` scopes every downstream tool to the token's `user_id`; a
  token can never read or mutate another user's data (all `_shared` queries
  already filter by `user_id`).
- Treat a token like a password: full financial read/write for that one user.
