# Expenses Tracker

A personal expense and income tracker built for the Cloudflare free tier.

## Stack

- React + Vite frontend
- Cloudflare Pages hosting
- Cloudflare Pages Functions API
- Cloudflare D1 database
- Email/password authentication with verified-email signup and signed HttpOnly cookies

The app stores money as integer paise and uses `Asia/Kolkata` for user-facing date calculations.
Existing personal data is mapped to the user `MSDian` at `batchumanish@gmail.com`.

## Local Development

Install dependencies:

```bash
npm install
```

Build the frontend:

```bash
npm run build
```

Apply D1 migrations locally:

```bash
npx wrangler d1 migrations apply expenses-tracker-db --local
```

Run the Cloudflare Pages app locally after building:

```bash
npx wrangler pages dev dist
```

If the D1 binding is not detected before the real database ID is configured, pass the binding explicitly:

```bash
npx wrangler pages dev dist --d1 DB=<DATABASE_ID>
```

For local auth testing, set `SESSION_SECRET` in `.dev.vars`. To test email codes without sending email, set:

```bash
EMAIL_DEV_SHOW_CODES=true
```

With that local-only flag, signup and password-reset verification endpoints return the code in the response so the login form can display it.

For production email delivery, configure Resend:

```bash
RESEND_API_KEY=your-resend-api-key
RESET_EMAIL_FROM=Expense Tracker <verified-sender@example.com>
```

To accept bank transaction messages from an iPhone Shortcuts automation, also
set a dedicated random token of at least 32 characters:

```bash
SMS_INGEST_TOKEN=replace-with-a-long-random-device-token
```

The Shortcut sends JSON to `POST /api/sms-imports/ingest` with this token in
the `Authorization: Bearer <token>` header. Accepted messages create an audit
row in `sms_imports` and an editable transaction with source `SMS`; the
complete, unedited SMS body is retained in the `raw_message` column. The
request contains only `sender` and `message`; the server records its own
arrival time.

Configure the Shortcut to call the endpoint only when the original SMS body
contains `debit`, `debited`, `credit`, or `credited`. Pass the message sender
and the complete, unedited message body as variables; do not use sample text in
the request. See [iPhone SMS automation setup](docs/IPHONE_SMS_AUTOMATION.md)
for the filter and request details. As a defensive fallback, the endpoint
returns a successful `skipped` result if a non-transaction message reaches it.
Once a required keyword is present, a recognizable INR amount is optional; an
unrecognized or absent amount is stored as `null` for later review.

SMS transaction titles use the parsed merchant/source when available. If no
merchant can be identified, the title is `SMS transaction from <sender>`.
Transactions can be filtered by source (`MANUAL` or `SMS`) on the transactions
page.

Deleting an SMS-captured transaction also permanently deletes its linked
`sms_imports` audit row and retained raw message.

## Transaction filters and saved views

The transactions page supports quick-filter chips (This month, Last month, UPI,
Cash, SMS only, Income only, Food, Uncategorized) plus advanced filters for date
range, type, category, payment method, source, minimum/maximum amount, and a
merchant/description search. Compatible filters combine, active filters are shown
as removable pills, and the full filter state lives in the URL query string so
views survive a refresh and can be shared. "This month"/"Last month" use the
app's `Asia/Kolkata` calendar; the Food chip resolves the user's own `Food`
expense category by name; Uncategorized matches transactions with no category;
amount bounds are compared against the integer paise amount.

Filtering, pagination, and totals are computed server-side. `GET /api/expenses`
accepts:

- `type` — `ALL` | `EXPENSE` | `INCOME`
- `source` — `ALL` | `MANUAL` | `SMS`
- `categoryId` — numeric category id (matches the category and its subcategories)
- `uncategorized` — `true` to match transactions with no category
- `paymentMethodId` — numeric payment-method id
- `from` / `to` — inclusive `YYYY-MM-DD` bounds
- `minAmount` / `maxAmount` — inclusive rupee bounds (converted to paise)
- `search` — case-insensitive match on title, merchant, and notes
- `sort` — `transaction_date_desc` (default), `transaction_date_asc`,
  `created_at_desc`, `created_at_asc`, `amount_desc`, `amount_asc`
- `limit` (1–100, default 50) / `offset` (default 0)

The response includes `items`, `total` (the filtered count), `limit`, and
`offset`. Sorting is deterministic; every sort breaks ties by `id`.

Authenticated users can save the current filter configuration as a named view.
Saved views are user-owned and stored in the `saved_transaction_views` table
(migration `0017_saved_transaction_views.sql`) with the filter data as validated
JSON. One view per user may be marked as the default and is applied automatically
when the page is opened without filters. Endpoints (all scoped to the session
user, so no user can read or modify another's views):

- `GET /api/saved-views` — list the user's views
- `POST /api/saved-views` — create `{ name, filters, isDefault? }`
- `PATCH /api/saved-views/:id` — rename, replace filters, or toggle default
- `DELETE /api/saved-views/:id` — delete a view

View names are 1–80 characters and unique per user (case-insensitive); filter
values are validated with the same schema used by the transactions endpoint.

Signup and password reset emails are sent through Resend:

```bash
RESEND_API_KEY=your-resend-api-key
RESET_EMAIL_FROM=Expense Tracker <verified-sender@example.com>
```

## Cloudflare Deployment

This project is configured for Cloudflare Pages with Vite, Pages Functions, and a D1 binding named `DB`.

1. Build the app:

```bash
npm run build
```

2. Create the D1 database if it does not already exist:

```bash
npx wrangler d1 create expenses-tracker-db
```

3. Copy the returned `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "expenses-tracker-db"
database_id = "<CLOUDFLARE_D1_DATABASE_ID>"
```

4. Apply migrations:

```bash
npx wrangler d1 migrations apply expenses-tracker-db --local
npx wrangler d1 migrations apply expenses-tracker-db --remote
```

5. Configure Cloudflare Pages:

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave empty because `package.json` is at the repository root

6. Configure the production D1 binding in Cloudflare Pages:

- Binding variable name: `DB`
- Database: `expenses-tracker-db`

7. Configure production environment variables in Cloudflare Pages:

- `SESSION_SECRET`
- `RESEND_API_KEY`
- `RESET_EMAIL_FROM`
- `SMS_INGEST_TOKEN`

Do not put secret values in React source files, `wrangler.toml`, or committed documentation.

8. Deploy through Cloudflare Pages or Wrangler:

```bash
npx wrangler pages deploy dist --project-name expenses-tracker
```

For non-interactive Wrangler runs, set `CLOUDFLARE_API_TOKEN` in the shell or CI environment. Do not commit this token.

## Production Smoke Test

After deployment, verify:

- Static app loads.
- `GET /api/health` returns success.
- `GET /api/expenses` returns `401` when logged out.
- Sign in works with an existing email address and password.
- Sign up requires full name, email address, password confirmation, and the correct emailed verification code.
- Forgot/reset password sends a verification code to the registered email and allows setting a new password after code verification.
- The migrated `MSDian` account at `batchumanish@gmail.com` can see the existing data.
- Add, edit, and delete an expense.
- Add, edit, and delete income.
- Add, edit, and delete unused custom categories.
- Add, edit, and delete unused custom payment methods.
- Dashboard stats load and reflect D1 data.
- An authenticated SMS ingestion request creates one pending import, and
  replaying the same message reports it as a duplicate.
- Mobile layout is usable.
- Cloudflare Pages Functions logs do not show raw production errors.

## MVP Limitations

- CSV export, bulk delete-all-data, and bank connection are placeholders only.
- SMS transactions are created automatically; a dedicated raw-message review
  screen is not yet implemented.
- Live bank sync, direct SBI API calls, Account Aggregator integration, OTP collection, and bank credential collection are not implemented.
- The app now supports separate email users, but billing, legal, support, and operational hardening are still needed before a broad public launch.
