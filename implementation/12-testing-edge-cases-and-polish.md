# Phase 12: Testing, Edge Cases, and Polish

## Goal

Verify the MVP end to end, harden edge cases, improve accessibility and responsiveness, and polish the user experience.

## Scope

This phase focuses on detailed validation and refinement across backend and frontend:

- No transactions.
- Invalid ID.
- Invalid amount.
- Invalid date.
- Future date behavior.
- Duplicate category/payment method.
- Deleting used category/payment method.
- Income using expense category.
- Expense using income category.
- Invalid filters.
- `from > to`.
- Invalid pagination.
- Auth failure.
- D1 binding missing.
- Network failure.
- Unsupported HTTP methods.
- Mobile responsiveness.
- Accessibility basics.

## Files/folders likely to be created or changed

- Existing `src/` files for UI fixes.
- Existing `functions/` files for API fixes.
- Existing `migrations/` files only if a schema defect must be corrected with a new migration.
- `README.md`, only if validation or known limitations need documentation.
- Test files, if a test setup already exists or is added deliberately.

## Step-by-step tasks

1. Create a manual test checklist from the requirements.
2. Validate authentication:
   - Correct login.
   - Wrong password.
   - Repeated wrong password.
   - Logout.
   - Expired or missing cookie.
3. Validate transaction API and UI:
   - Add expense.
   - Add income.
   - Edit transaction.
   - Delete transaction.
   - Invalid ID.
   - Invalid amount.
   - Invalid date.
   - Future-dated transaction.
   - Long fields.
4. Validate category and payment method behavior:
   - Duplicate names.
   - Default deletion blocked.
   - Used deletion blocked.
   - Custom unused deletion allowed.
5. Validate filters and pagination:
   - Date range.
   - `from > to`.
   - Type.
   - Category.
   - Payment method.
   - Search.
   - Invalid limit/offset.
6. Validate dashboard:
   - No data.
   - Income only.
   - Expense only.
   - Mixed data.
   - Zero-value days/months.
   - Asia/Kolkata today/week/month boundaries.
7. Validate settings:
   - Week start day.
   - Theme if implemented.
   - No bank credential inputs.
8. Validate unsupported methods:
   - Ensure 405 for routes where method is not allowed.
9. Validate missing D1 binding handling:
   - Confirm the app returns a safe error and does not crash with raw details.
10. Polish frontend:
   - Responsive layout.
   - Form spacing.
   - Button states.
   - Loading states.
   - Empty states.
   - Error messages.
   - Success messages.
11. Accessibility basics:
   - Labels for form fields.
   - Keyboard-accessible controls.
   - Dialog focus behavior where practical.
   - Sufficient color contrast.
   - Meaningful button text or accessible labels.
12. Run final build and relevant local tests.

## Validation/testing steps

- Run `npm run build`.
- Run any configured lint/test command.
- Run local Pages Functions if practical.
- Manually smoke test core flows in browser.
- Test mobile viewport.
- Test unauthenticated API requests.
- Test malformed API requests.
- Verify no secrets are in `src/`.
- Verify no bank credential inputs exist.

## Edge cases to handle

- No transactions.
- Invalid transaction ID.
- Deleting a transaction that does not exist.
- Editing a transaction that does not exist.
- Duplicate category name.
- Duplicate payment method name.
- Deleting category/payment method already used.
- Deleting default category/payment method.
- Income transaction using expense category.
- Expense transaction using income category.
- Amount is 0.
- Negative amount.
- Very large amount.
- Invalid decimal amount.
- Invalid date format.
- Future-dated transaction.
- `from` date greater than `to` date.
- Invalid limit/offset.
- Empty title.
- Very long title/notes/merchant.
- Network/API failure on frontend.
- D1 binding missing locally or in production.
- Unsupported HTTP method.
- Production error should not expose raw DB error.
- Mobile overflow.
- Keyboard navigation issues.

## Acceptance criteria

- Core MVP flows pass manual validation.
- Build succeeds.
- Auth, API, database, and UI edge cases behave predictably.
- Mobile layout is usable.
- Accessibility basics are addressed.
- No secrets are exposed in frontend code.
- No bank sync or credential collection exists.
- Remaining known limitations are documented.

## Dependencies on previous phases

- Phases 01 through 11 should be complete.

## What must not be done in this phase

- Do not add large new features.
- Do not rewrite the app for polish only.
- Do not implement live bank sync.
- Do not add paid infrastructure.
- Do not collect bank credentials.
- Do not hide failing acceptance criteria by marking them complete.

