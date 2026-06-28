# Expenses Tracker

A personal expense and income tracker built for the Cloudflare free tier.

## Stack

- React + Vite frontend
- Cloudflare Pages hosting
- Cloudflare Pages Functions API
- Cloudflare D1 database
- App-password authentication with signed HttpOnly cookies

The app stores money as integer paise and uses `Asia/Kolkata` for user-facing date calculations.
The initial login password comes from `APP_PASSWORD`. If you later reset the password through the forgot-password flow, the new password is stored as a hash in D1 and takes precedence over the original environment value.

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

For local auth testing, set `APP_PASSWORD` and `SESSION_SECRET` in `.dev.vars`. This file is ignored by git.

To accept bank transaction messages from an iPhone Shortcuts automation, also
set a dedicated random token of at least 32 characters:

```bash
SMS_INGEST_TOKEN=replace-with-a-long-random-device-token
```

The Shortcut sends JSON to `POST /api/sms-imports/ingest` with this token in
the `Authorization: Bearer <token>` header. Accepted messages are parsed into
pending rows in `sms_imports`; the raw SMS body is not retained. The request
contains only `sender` and `message`; the server records its own arrival time.

Configure the Shortcut to call the endpoint only when the original SMS body
contains `debit`, `debited`, `credit`, or `credited`. Pass the message sender
and the complete, unedited message body as variables; do not use sample text in
the request. See [iPhone SMS automation setup](docs/IPHONE_SMS_AUTOMATION.md)
for the filter and request details. As a defensive fallback, the endpoint
returns a successful `skipped` result if a non-transaction message reaches it.

Password reset emails are sent through Resend. To enable the "Forgot password?" flow, also set:

```bash
RESEND_API_KEY=your-resend-api-key
RESET_EMAIL_FROM=Expense Tracker <verified-sender@example.com>
RESET_EMAIL_TO=batchumanish@gmail.com
```

`RESET_EMAIL_TO` is optional and defaults to `batchumanish@gmail.com`.

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

- `APP_PASSWORD`
- `SESSION_SECRET`
- `RESEND_API_KEY`
- `RESET_EMAIL_FROM`
- `RESET_EMAIL_TO` optional; defaults to `batchumanish@gmail.com`
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
- Login works with the configured `APP_PASSWORD`.
- Forgot password sends a verification code to the configured reset email.
- After password reset, login works with the newly saved password from D1.
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
- SMS imports are stored for later review; the review/confirm UI is not yet
  implemented.
- Live bank sync, direct SBI API calls, Account Aggregator integration, OTP collection, and bank credential collection are not implemented.
- The app is intended for personal use on Cloudflare Pages, Pages Functions, and D1 free-tier infrastructure.
