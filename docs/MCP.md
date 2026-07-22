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
