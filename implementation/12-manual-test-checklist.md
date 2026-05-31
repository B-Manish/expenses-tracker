# Phase 12 Manual Test Checklist

Use this checklist while validating Phase 12 locally through Wrangler Pages and the browser UI.

## Authentication

- [ ] Correct password logs in and sets an HttpOnly session cookie.
- [ ] Wrong password returns a visible error.
- [ ] Five repeated wrong passwords return `429 Too Many Requests`.
- [ ] Logout clears the session and returns to login.
- [ ] Missing or expired cookies receive `401` on protected APIs.

## Transactions

- [ ] Add expense.
- [ ] Add income.
- [ ] Edit transaction.
- [ ] Delete transaction after confirmation.
- [ ] Invalid transaction ID returns a predictable error.
- [ ] Amount `0`, negative amount, very large amount, and more than two decimals are rejected.
- [ ] Invalid date format is rejected.
- [ ] Future-dated transaction can be saved intentionally.
- [ ] Empty title and overly long title, merchant, or notes are rejected.
- [ ] Expense transactions cannot use income categories.
- [ ] Income transactions cannot use expense categories.

## Categories And Payment Methods

- [ ] Add custom category.
- [ ] Edit custom category.
- [ ] Duplicate category name returns a clear error.
- [ ] Default category deletion is unavailable in the UI and blocked by the API.
- [ ] Used custom category deletion returns a clear conflict.
- [ ] Unused custom category deletion succeeds.
- [ ] Add custom payment method.
- [ ] Edit custom payment method.
- [ ] Duplicate payment method name returns a clear error.
- [ ] Default payment method deletion is unavailable in the UI and blocked by the API.
- [ ] Used custom payment method deletion returns a clear conflict.
- [ ] Unused custom payment method deletion succeeds.

## Filters And Pagination

- [ ] Date range filter works.
- [ ] `from > to` is rejected before request and by the API.
- [ ] Type filter works.
- [ ] Category filter works.
- [ ] Payment method filter works.
- [ ] Search works for title, merchant, and notes.
- [ ] Invalid `limit` and `offset` return validation errors.
- [ ] Pagination controls do not navigate past valid bounds.

## Dashboard

- [ ] Empty database returns zero values and empty arrays.
- [ ] Income-only data shows zero expenses and positive income.
- [ ] Expense-only data shows zero income and negative/expense balance.
- [ ] Mixed data shows total income, total expense, and net balance.
- [ ] Daily trend includes zero-value days.
- [ ] Monthly trend includes zero-value months.
- [ ] Today, week, and month totals use Asia/Kolkata dates.
- [ ] Week totals follow the saved week start setting.

## Settings And Safety

- [ ] Week start day can be updated.
- [ ] Theme preference saves without breaking layout.
- [ ] Timezone remains Asia/Kolkata.
- [ ] Export placeholder does not download fake data.
- [ ] Delete-all-data placeholder does not delete data.
- [ ] Bank connection placeholder has no credential inputs.
- [ ] No live bank sync, SBI API calls, OTP fields, or bank credential collection exists.

## API Hardening

- [ ] Unsupported methods return `405`.
- [ ] Missing D1 binding returns a safe JSON `500` error.
- [ ] Production-style internal errors do not expose raw database details.
- [ ] Unauthenticated protected API requests return `401`.
- [ ] API responses keep the standard `{ success, data/error }` format.

## Frontend Polish

- [ ] Loading states are visible while fetching.
- [ ] Empty states are useful.
- [ ] Network/API failures show retryable errors.
- [ ] Forms expose validation messages.
- [ ] Delete confirmation is keyboard reachable, Escape closes it, and focus returns after close.
- [ ] Desktop layout has no clipping or overlap.
- [ ] Mobile layout is usable at narrow widths.
- [ ] Interactive icon controls have accessible labels.
- [ ] No secrets are present in `src/`.

## Known MVP Limitations

- CSV export, delete-all-data, and bank connection are placeholders only.
- Live bank sync, direct SBI APIs, Account Aggregator integration, OTP collection, and bank credential collection are intentionally out of scope.
