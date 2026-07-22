# Expense Tracker MCP Server — Design

**Date:** 2026-07-22
**Status:** Approved for planning
**Author:** Manish (with Claude Code)

## Goal

Expose the Cashly expense tracker to MCP clients (Claude Code, Cursor, Codex) so
the user can query and manage their finances in natural language, e.g.
"How much did I spend on food this week?" or "Add a ₹250 lunch expense today."

## Approach summary

A **remote MCP server hosted as a Pages Function in this same Cloudflare Pages
project**. It speaks stateless Streamable-HTTP JSON-RPC at `POST /mcp`, binds
`env.DB` directly, and reuses the existing `functions/_shared/*` modules
(`stats.js`, `transactions.js`, `categories.js`, `paymentMethods.js`,
`budgets.js`, `money.js`, `dates.js`). No changes to existing API endpoints. No
new external dependencies — the JSON-RPC layer is hand-rolled (~150 lines)
because the official SDK's Streamable-HTTP transport is Node-`http`-shaped and
does not fit the Cloudflare Workers runtime cleanly.

### Why this over the alternatives

- **vs. calling its own REST API over HTTPS:** direct `env.DB` reuse avoids an
  extra network hop and re-implementing the cookie-login dance. Same validation
  and query code, called in-process.
- **vs. a separate Worker with `McpAgent`/Durable Objects:** the stateless
  single-user read/write workload needs no session state or DO. A separate
  Worker would need its own D1 binding and a duplicated copy of the `_shared`
  modules. A Pages Function reuses everything.

## Architecture

```
MCP client (Claude Code / Cursor / Codex)
   │  HTTPS POST /mcp
   │  Authorization: Bearer <MCP_TOKEN>
   │  Content-Type: application/json      body = JSON-RPC 2.0
   ▼
functions/mcp/index.js
   │  1. bearer auth (mirror SMS ingest token check)
   │  2. parse JSON-RPC
   │  3. dispatch: initialize | tools/list | tools/call | ping
   │  4. tools/call → run tool handler → convert paise→rupees → JSON-RPC result
   ▼
functions/_shared/mcp/{protocol,tools,auth}.js
   │  tool handlers call existing _shared functions with a fixed userId
   ▼
functions/_shared/{stats,transactions,categories,paymentMethods,budgets}.js
   ▼
D1 (expenses-db)  via env.DB
```

## Transport & protocol

- **Endpoint:** `POST /mcp`. `GET`/other methods → HTTP 405 (server offers no
  server-initiated SSE stream; stateless request/response only).
- **Transport:** Streamable HTTP, JSON responses only. Each request returns a
  single `application/json` JSON-RPC response. No `Mcp-Session-Id`, no SSE, no
  Durable Object. This is spec-compliant for a stateless server.
- **JSON-RPC methods handled:**
  - `initialize` → returns `{ protocolVersion, capabilities: { tools: {} },
    serverInfo: { name: "cashly-expenses", version } }`. Echo the client's
    requested `protocolVersion` if it is a string; else default to the latest
    known (`"2025-06-18"`).
  - `notifications/initialized` → no response body (HTTP 202, empty).
  - `tools/list` → returns the tool registry (name, description, inputSchema,
    annotations).
  - `tools/call` → runs the named tool with validated arguments.
  - `ping` → `{}`.
  - Unknown method → JSON-RPC error `-32601` (Method not found).
- **Batch requests:** not supported in v1 (single request object only). If a
  JSON array arrives, respond with JSON-RPC error `-32600`. (MCP clients in
  scope send single requests.)

## Authentication

- New secret **`MCP_TOKEN`** (≥32 chars), set in Cloudflare Production secrets
  and local `.dev.vars`, following the same handling as `SMS_INGEST_TOKEN`.
- `functions/_shared/mcp/auth.js` exports `requireMcpAuthorization(request, env)`:
  - Rejects (HTTP 401, JSON-RPC-shaped body) if `Authorization` header is
    missing or not `Bearer <token>`.
  - Compares the presented token against `env.MCP_TOKEN` using SHA-256 +
    constant-time compare (same technique as `smsImports.js`).
  - If `env.MCP_TOKEN` is missing/short, returns HTTP 500 "MCP server is not
    configured" (mirrors the SMS "not configured" behaviour).
  - `ponytail:` the ~15-line sha256 + constantTimeEqual helpers are duplicated
    from `smsImports.js` rather than refactoring the working SMS auth path.
    Extract to a shared `crypto.js` only if a third consumer appears.
- Auth is checked **before** JSON-RPC parsing. Unauthenticated requests never
  reach the dispatcher.

## Single-user model

All `_shared` functions take `(db, userId, …)`. The MCP server is single-user:
`userId = env.MCP_USER_ID || DEFAULT_USER_ID` (`"phone:9949055750"`), resolved
once per request. No per-tool user argument.

## Money representation

Tool **inputs** accept amounts in rupees (e.g. `250` or `"250.50"`) — the
existing schemas already accept a rupees `amount` field via
`parseRupeesToPaise`. Tool **outputs** convert paise → rupees so the LLM never
sees `25000`:

- A util `toRupeesView(value)` recursively walks the result object; for any key
  ending in `Paise` it emits the same key with the suffix removed, holding a
  rupees Number (`paise / 100`, 2 decimals), and drops the original `*Paise`
  key. Covers `amountPaise`, `spentPaise`, `remainingPaise`, `totalIncomePaise`,
  `totalExpensePaise`, `netBalancePaise`, etc. uniformly.
- Negative values (e.g. `netBalance`) are preserved.

## Name → id resolution

Tools that reference a category or payment method accept **either** a numeric id
**or** a name string (`category`, `paymentMethod` args). A resolver looks up the
name (case-insensitive) among the user's categories / payment methods and
substitutes the id before calling the underlying `_shared` function. Ambiguous
or unknown names return a tool error listing valid options. This lets
"food this week" work without the client first calling `list_categories`.

## Tools (17)

Reads are annotated `readOnlyHint: true`; deletes `destructiveHint: true`
(clients prompt before running them — the chosen guard rail). All inputs are
validated by the existing Zod schemas via the wrapped `_shared` functions;
additional MCP-only args (`period`, name resolution) are validated in the tool
layer.

### Spending / query

1. **`get_spending_summary`** — *readOnly*. Args: `period`
   (`today`|`week`|`month`|`year`|`custom`, default `month`) and, when
   `custom`, `from`+`to` (`YYYY-MM-DD`). Resolves the period to an Asia/Kolkata
   date range server-side via `dates.js` helpers
   (`currentWeekRangeInKolkata`, `currentMonthRangeInKolkata`, `todayInKolkata`,
   year = Jan 1–Dec 31), then calls `getDashboardStats`. Returns totals, per-
   category breakdown, biggest expense, most-used category, daily/monthly
   trends, budgets — all in rupees. **This is the workhorse for "how much did I
   spend on X this week"**: the client reads the matching line from
   `categoryBreakdown`.
2. **`list_transactions`** — *readOnly*. Wraps `listTransactions` +
   `validateTransactionQuery`. Args mirror the existing filters: `type`
   (`ALL`|`EXPENSE`|`INCOME`), `category` (name or id), `paymentMethod`
   (name or id), `from`, `to`, `minAmount`, `maxAmount` (rupees), `search`,
   `source` (`ALL`|`MANUAL`|`SMS`), `sort`, `limit` (≤100), `offset`. Returns
   `{ items, total, limit, offset }` in rupees.

### Transactions (full CRUD)

3. **`create_transaction`** — wraps `validateTransactionPayload` +
   `createTransaction`. Args: `type`, `title`, `amount` (rupees), `category`
   (name/id, optional), `paymentMethod` (name/id, optional), `transactionDate`
   (`YYYY-MM-DD`), `transactionTime` (`HH:mm`, default `00:00`), `merchant`,
   `notes`.
4. **`update_transaction`** — wraps `updateTransaction`. Args: `id` + the same
   fields as create (full replacement, matching the existing PUT semantics).
5. **`delete_transaction`** — *destructive*. Wraps `deleteTransaction`. Args:
   `id`. (Also cleans up a linked SMS import, per existing behaviour.)

### Categories (full CRUD)

6. **`list_categories`** — *readOnly*. Wraps `listCategories`. Args:
   `type` (optional), `includeNested` (default true).
7. **`create_category`** — wraps `validateCategoryPayload` + `createCategory`.
   Args: `name`, `type`, `color` (hex, optional), `icon` (optional),
   `parentId` (optional).
8. **`update_category`** — wraps `updateCategory`. Args: `id` + create fields.
9. **`delete_category`** — *destructive*. Wraps `deleteCategory`. Args: `id`.
   (Existing guards reject deleting defaults / in-use / with-subcategories.)

### Payment methods (full CRUD)

10. **`list_payment_methods`** — *readOnly*. Wraps `listPaymentMethods`.
11. **`create_payment_method`** — wraps `validatePaymentMethodPayload` +
    `createPaymentMethod`. Args: `name`.
12. **`update_payment_method`** — wraps `updatePaymentMethod`. Args: `id`,
    `name`.
13. **`delete_payment_method`** — *destructive*. Wraps `deletePaymentMethod`.
    Args: `id`. (Existing guards reject defaults / in-use.)

### Budgets (full CRUD)

14. **`list_budgets`** — *readOnly*. Wraps `listBudgets`; returns items +
    summary + progress (spent/remaining/percent/status) in rupees.
15. **`create_budget`** — wraps `validateBudgetPayload` + `createBudget`. Args:
    `category` (name/id), `amount` (rupees), `period` (default `MONTHLY`),
    `isActive` (default true).
16. **`update_budget`** — wraps `updateBudget`. Args: `id` + create fields.
17. **`delete_budget`** — *destructive*. Wraps `removeBudget`. Note the existing
    semantics: an **active** budget is **deactivated** (history + active slot
    preserved); an already-inactive budget is **hard-deleted**. The tool
    description states this so the client sets expectations.

## Error handling

- **Protocol errors** (bad JSON, missing method, non-object request) → JSON-RPC
  error object (`-32700` parse, `-32600` invalid request, `-32601` method not
  found) with HTTP 200.
- **Auth errors** → HTTP 401/500 with a JSON-RPC-shaped error body (before
  dispatch).
- **Tool errors** — the wrapped `_shared` functions throw `ApiError`
  (`badRequest`, `notFound`, `conflict`, …) or `validate()` returns
  `{ ok:false, error }`. The tool layer catches these and returns a **successful
  JSON-RPC response** whose `result` is `{ content: [{ type:"text", text:
  <error.publicMessage> }], isError: true }` — the MCP convention that lets the
  LLM see and react to the error (e.g. "Category name already exists") rather
  than the call hard-failing.
- Unexpected non-`ApiError` throws → generic `isError` tool result with a safe
  message; details are not leaked.

## File layout (new)

```
functions/
  mcp/
    index.js                 # POST handler: auth → parse → dispatch
  _shared/
    mcp/
      protocol.js            # JSON-RPC dispatch: initialize/tools.list/tools.call/ping
      tools.js               # tool registry + handlers (wrap _shared fns)
      auth.js                # requireMcpAuthorization (bearer, sha256, constant-time)
      serialize.js           # toRupeesView + resolveCategory/resolvePaymentMethod
      tools.test.js          # node --test
```

`index.js` stays thin; each unit has one job and is independently testable.

## Configuration & deployment changes

- **Secrets:** add `MCP_TOKEN` to Cloudflare Production secrets and to local
  `.dev.vars`. Optional `MCP_USER_ID` (defaults to `DEFAULT_USER_ID`).
- **`wrangler.toml`:** no change — `functions/` and the `DB` binding already
  cover the new endpoint.
- **`DEPLOYMENT_SYNC_GUIDE.md`:** add `MCP_TOKEN` (and optional `MCP_USER_ID`)
  to the secrets table and the production verification checklist
  (`/mcp` returns a valid `initialize` response with a valid token; 401 without).
- **No migrations** — no schema change.

## Client setup (documented in a short README section)

- **Claude Code:**
  `claude mcp add --transport http cashly https://tracker.manishbatchu.com/mcp --header "Authorization: Bearer <MCP_TOKEN>"`
- **Cursor / Codex:** an MCP config entry with `url` and an
  `Authorization: Bearer <MCP_TOKEN>` header.

## Testing

`functions/_shared/mcp/tools.test.js` using `node --test` (matches
`package.json`'s `"test": "node --test"`), against a small in-memory `db` stub
that implements the `prepare().bind().first()/all()/run()` shape the `_shared`
functions use:

1. `initialize` returns capabilities + serverInfo.
2. `tools/list` lists all 17 tools with annotations.
3. `tools/call` happy path: `create_transaction` (rupees in) then
   `list_transactions` returns it (rupees out).
4. `get_spending_summary` with `period:"week"` resolves a Kolkata range and
   returns a rupee breakdown.
5. Validation error path: `create_transaction` with a bad amount → `isError`
   tool result carrying the Zod message.
6. Auth: missing/invalid bearer → 401 before dispatch.

## Out of scope (v1)

- Recurring expenses CRUD, saved views CRUD (niche; add later if wanted).
- OAuth / multi-user (single-user token model is sufficient).
- MCP resources / prompts (tools only).
- JSON-RPC batch requests and server-initiated SSE.

## Risks / notes

- **Client header support:** all three target clients support custom headers on
  remote MCP servers; the bearer token rides in `Authorization`.
- **`MCP_TOKEN` is a full-access credential** to the single user's finances —
  treat like `APP_PASSWORD`. Rotation follows the existing secret-rotation flow.
- **`delete_budget` is a soft-delete for active budgets** — documented in the
  tool so it isn't mistaken for a hard delete.
