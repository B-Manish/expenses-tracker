# Phase 05: Transactions CRUD API

## Goal

Implement authenticated CRUD APIs for manual expense and income transactions.

## Scope

This phase implements:

- `GET /api/expenses`
- `POST /api/expenses`
- `GET /api/expenses/:id`
- `PUT /api/expenses/:id`
- `DELETE /api/expenses/:id`
- Search
- Filters
- Pagination
- Sorting
- Validation
- Category type matching transaction type
- Safe integer paise conversion
- Not-found handling

All routes must require authentication.

## Files/folders likely to be created or changed

- `functions/api/expenses/index.js`
- `functions/api/expenses/[id].js`
- `functions/_shared/transactions.js`, if useful
- `functions/_shared/validation.js`
- `functions/_shared/money.js`
- `functions/_shared/dates.js`
- `functions/_shared/db.js`
- `functions/_shared/auth.js`

## Step-by-step tasks

1. Protect all transaction routes with the auth helper.
2. Define accepted transaction payload:
   - `type`: `EXPENSE` or `INCOME`
   - `title`
   - `amount` or `amountPaise`, depending on chosen API shape
   - `category_id`
   - `payment_method_id`
   - `transaction_date`
   - `merchant`
   - `notes`
3. Implement amount validation and conversion:
   - Accept frontend rupee input only if safely converted.
   - Store `amount_paise` as integer.
   - Reject zero, negative, invalid decimal, and excessive values.
4. Implement date validation:
   - Require `YYYY-MM-DD`.
   - Reject invalid calendar dates.
   - Allow future dates only if explicitly submitted by the user.
5. Implement category validation:
   - If `type = EXPENSE`, category must be an expense category.
   - If `type = INCOME`, category must be an income category.
   - If category is optional, ensure null behavior is intentional.
6. Implement payment method validation:
   - If provided, payment method must exist.
7. Implement `GET /api/expenses`:
   - Support `type`.
   - Support `category_id`.
   - Support `payment_method_id`.
   - Support inclusive `from` and `to`.
   - Support `search`.
   - Support `limit` and `offset`.
   - Support sorting by transaction date and created time.
   - Return result rows and pagination metadata or enough data for frontend pagination.
8. Implement `POST /api/expenses`:
   - Validate body.
   - Insert with prepared statement.
   - Return created transaction with 201.
9. Implement `GET /api/expenses/:id`:
   - Validate ID.
   - Return 404 if missing.
10. Implement `PUT /api/expenses/:id`:
   - Validate ID and body.
   - Return 404 if missing.
   - Update `updated_at = CURRENT_TIMESTAMP`.
11. Implement `DELETE /api/expenses/:id`:
   - Validate ID.
   - Return 404 if missing.
   - Delete with prepared statement.
12. Ensure no route builds SQL by concatenating user input.

## Validation/testing steps

- Create an expense and verify it persists in D1.
- Create income and verify it persists in D1.
- Fetch all transactions.
- Fetch one transaction by ID.
- Update a transaction and verify `updated_at` changes.
- Delete a transaction and verify it no longer exists.
- Search by title, merchant, and notes if supported.
- Filter by date range, category, payment method, and type.
- Paginate with valid `limit` and `offset`.
- Confirm invalid IDs return 400 or 404 as appropriate.
- Confirm unauthenticated requests return 401.
- Confirm unsupported methods return 405.

## Edge cases to handle

- Invalid transaction ID.
- Missing transaction ID.
- Transaction not found.
- Empty title.
- Very long title, merchant, or notes.
- Amount is 0.
- Amount is negative.
- Amount has too many decimal places.
- Amount exceeds the configured maximum.
- Invalid date format.
- Impossible calendar date.
- `from > to`.
- Invalid `limit` or `offset`.
- Invalid sort field or sort direction.
- Expense uses an income category.
- Income uses an expense category.
- Missing D1 binding.
- Production database error should not expose raw details.

## Acceptance criteria

- All transaction CRUD endpoints exist and require authentication.
- Transactions can be created, read, updated, deleted, searched, filtered, sorted, and paginated.
- Money is stored as integer paise.
- Category type matching is enforced.
- All SQL uses prepared statements.
- All responses use the standard JSON format.
- Edge cases return appropriate HTTP status codes.

## Dependencies on previous phases

- Phase 02 authentication must be complete.
- Phase 03 D1 schema must be complete.
- Phase 04 shared API helpers must be complete.

## What must not be done in this phase

- Do not implement frontend transaction UI.
- Do not implement dashboard charts.
- Do not implement category or payment method management endpoints beyond lookups needed for validation.
- Do not store money as floating point.
- Do not expose D1 to the browser.
- Do not implement bank sync.

