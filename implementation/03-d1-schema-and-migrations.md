# Phase 03: D1 Schema and Migrations

## Goal

Create the initial Cloudflare D1 database schema and seed data required by the MVP.

## Scope

This phase creates the first migration for:

- `transactions`
- `categories`
- `payment_methods`
- `settings`
- Optional `bank_connections` placeholder table only if added cleanly without implementing bank sync

Rules:

- Store money as integer paise, not floating point.
- Store `transaction_date` as local `YYYY-MM-DD`.
- Store `created_at` and `updated_at` as UTC timestamps.
- Use foreign keys for category and payment method references.
- Add indexes for filtering, sorting, and stats.
- Seed default categories, payment methods, and settings.
- Default user-facing timezone is `Asia/Kolkata`.

## Files/folders likely to be created or changed

- `migrations/0001_initial.sql`
- `wrangler.toml`, only if D1 database metadata or binding needs adjustment
- `README.md`, only for migration notes if needed

## Step-by-step tasks

1. Create `migrations/0001_initial.sql`.
2. Enable or respect foreign key behavior supported by D1.
3. Create `categories` table:
   - `id`
   - `name`
   - `type` as `EXPENSE` or `INCOME`
   - `color`
   - `icon`
   - `is_default`
   - `created_at`
   - `updated_at`
4. Create `payment_methods` table:
   - `id`
   - `name`
   - `is_default`
   - `created_at`
   - `updated_at`
5. Create `transactions` table:
   - `id`
   - `type`
   - `title`
   - `amount_paise`
   - `category_id`
   - `payment_method_id`
   - `transaction_date`
   - `merchant`
   - `notes`
   - `created_at`
   - `updated_at`
   - Foreign keys with `ON DELETE SET NULL`.
6. Create `settings` table:
   - `key`
   - `value`
   - `updated_at`
7. Optionally create `bank_connections` placeholder:
   - Use status fields only.
   - Do not add credential fields.
   - Do not implement bank sync behavior.
8. Add indexes:
   - `transaction_date`
   - `type`
   - `category_id`
   - `payment_method_id`
   - `created_at`
   - `(type, transaction_date)`
   - `(category_id, transaction_date)`
   - `(payment_method_id, transaction_date)`
9. Seed expense categories:
   - Food
   - Transport
   - Shopping
   - Fuel
   - Bills
   - Rent
   - Health
   - Entertainment
   - Travel
   - Education
   - Other Expense
10. Seed income categories:
   - Salary
   - Freelance
   - Refund
   - Interest
   - Other Income
11. Seed payment methods:
   - Cash
   - UPI
   - Debit Card
   - Credit Card
   - Net Banking
   - Wallet
   - Other
12. Seed settings:
   - `currency = INR`
   - `week_start_day = MONDAY`
   - `theme = system`
   - `timezone = Asia/Kolkata`
13. Apply migration locally:
   - `npx wrangler d1 migrations apply expenses-tracker-db --local`
14. Do not apply remote migration until deployment credentials and database ID are confirmed.

## Validation/testing steps

- Apply migration locally without SQL errors.
- Inspect local D1 tables.
- Confirm all required tables exist.
- Confirm seeded categories and payment methods exist exactly once.
- Confirm settings exist.
- Confirm money column is `amount_paise INTEGER`.
- Confirm no money column uses `REAL` or floating-point storage.
- Confirm indexes exist.
- Confirm foreign keys are syntactically valid for D1.

## Edge cases to handle

- Migration has already been applied locally.
- Seed data should not duplicate rows on repeated migration attempts.
- Category names must be unique while allowing both expense and income categories as specified.
- Default rows should be identifiable with `is_default = 1`.
- D1 binding may not exist locally yet.
- D1 database ID may still be a placeholder.
- Future bank placeholder must not imply real bank connection support.

## Acceptance criteria

- Initial migration exists at `migrations/0001_initial.sql`.
- All required tables are created.
- Default categories and payment methods are seeded.
- Initial settings are seeded.
- Money is stored as integer paise.
- `transaction_date` is stored as a local date string.
- Required indexes exist.
- The migration can be applied locally or any environment blocker is documented.

## Dependencies on previous phases

- Phase 01 should be complete.
- Phase 02 may be complete, but the schema can be created independently of auth.

## What must not be done in this phase

- Do not implement API handlers.
- Do not implement React UI.
- Do not store amounts as floating point.
- Do not add credential fields for bank connections.
- Do not implement live SBI sync.
- Do not collect bank username, password, or OTP.
- Do not use KV for core transaction data.

