# Phase 09: Transactions UI, Forms, Filters, and Table

## Goal

Build the frontend transaction management experience for adding, editing, deleting, searching, filtering, sorting, and viewing expenses and income.

## Scope

This phase implements:

- Add transaction form.
- Edit transaction form.
- Delete confirmation.
- Transactions list/table.
- Mobile-friendly transaction cards.
- Filters:
  - Date range.
  - Category.
  - Payment method.
  - Type.
  - Search.
- Sorting.
- Pagination.
- Form validation.
- Currency formatting.
- Empty states.

## Files/folders likely to be created or changed

- `src/pages/Expenses.jsx`
- `src/pages/AddExpense.jsx`
- `src/pages/EditExpense.jsx`
- `src/components/ExpenseForm.jsx`
- `src/components/ExpenseTable.jsx`
- `src/components/FilterBar.jsx`
- `src/components/ConfirmDialog.jsx`
- `src/components/EmptyState.jsx`
- `src/components/LoadingState.jsx`
- `src/components/ErrorState.jsx`
- `src/services/api.js`
- `src/utils/currency.js`
- `src/utils/dateUtils.js`
- `src/utils/validation.js`
- `src/index.css`

## Step-by-step tasks

1. Load categories and payment methods for forms and filters.
2. Build reusable `ExpenseForm`:
   - Supports `EXPENSE` and `INCOME`.
   - Title.
   - Amount in rupees.
   - Category filtered by selected type.
   - Payment method.
   - Transaction date.
   - Merchant/source.
   - Notes.
3. Add frontend validation:
   - Required title.
   - Required positive amount.
   - Up to 2 decimal places.
   - Required valid date.
   - Matching category type.
   - Reasonable field lengths.
4. Implement Add Expense/Income page:
   - Submit to `POST /api/expenses`.
   - Show loading and error states.
   - Redirect to `/expenses` after success.
5. Implement Edit Expense/Income page:
   - Load `GET /api/expenses/:id`.
   - Prefill form.
   - Submit to `PUT /api/expenses/:id`.
   - Handle not found.
6. Implement delete confirmation:
   - Confirm before `DELETE /api/expenses/:id`.
   - Update list after success.
7. Build transactions list:
   - Desktop table.
   - Mobile card layout.
   - Show type, title, amount, category, payment method, date, merchant, and actions.
8. Build filters:
   - Date range.
   - Category.
   - Payment method.
   - Type.
   - Search.
9. Implement query sync:
   - Keep filters in component state or URL query params.
   - Refetch when filters change.
10. Implement pagination:
   - Limit.
   - Offset or page number.
   - Disable invalid navigation.
11. Implement sorting:
   - Date and created time at minimum.
   - Use only backend-supported sort values.
12. Add empty, loading, error, and success states.
13. Ensure INR formatting from paise is consistent.

## Validation/testing steps

- Add an expense from the UI.
- Add income from the UI.
- Edit existing transaction.
- Delete existing transaction after confirmation.
- Cancel delete and verify nothing changes.
- Filter by date range, category, payment method, and type.
- Search by text.
- Sort transactions.
- Paginate through results.
- Verify mobile card layout at narrow widths.
- Verify empty state when no transactions exist.
- Verify validation messages for invalid input.
- Verify unauthorized API response redirects or prompts login.

## Edge cases to handle

- No transactions.
- No categories or payment methods returned.
- Invalid transaction ID in edit route.
- Transaction not found.
- Invalid amount.
- Future date.
- Invalid date.
- Expense category selected for income.
- Income category selected for expense.
- `from > to`.
- Invalid filters in URL.
- Network failure.
- Delete failure.
- Very long title, merchant, or notes.
- Mobile table overflow.

## Acceptance criteria

- Users can add expenses and income from the UI.
- Users can edit and delete transactions from the UI.
- Users can search, filter, sort, and paginate transactions.
- Forms validate before submission and display backend validation errors.
- Mobile and desktop views are usable.
- Currency displays in INR using integer paise values from the API.
- Empty, loading, success, and error states are present.

## Dependencies on previous phases

- Phase 05 transaction APIs must be complete.
- Phase 06 category and payment method APIs must be complete.
- Phase 08 routing and API service must be complete.

## What must not be done in this phase

- Do not change backend API contracts unless required to fix a defect.
- Do not build final dashboard charts.
- Do not implement bank connection UI.
- Do not collect bank credentials.
- Do not store money as frontend floating-point values beyond transient form input; send values safely for backend conversion.

