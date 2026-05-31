# Phase 06: Categories and Payment Methods API

## Goal

Implement authenticated APIs for managing categories and payment methods.

## Scope

This phase implements:

- `GET /api/categories`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`
- `GET /api/payment-methods`
- `POST /api/payment-methods`
- `PUT /api/payment-methods/:id`
- `DELETE /api/payment-methods/:id`

The APIs must handle duplicate names, default records, used records, and income vs expense category types.

## Files/folders likely to be created or changed

- `functions/api/categories/index.js`
- `functions/api/categories/[id].js`
- `functions/api/payment-methods/index.js`
- `functions/api/payment-methods/[id].js`
- `functions/_shared/categories.js`, if useful
- `functions/_shared/paymentMethods.js`, if useful
- `functions/_shared/validation.js`
- `functions/_shared/db.js`
- `functions/_shared/auth.js`

## Step-by-step tasks

1. Protect all routes with the auth helper.
2. Implement category validation:
   - Name is required.
   - Name must be trimmed.
   - Name must be within a reasonable length.
   - Type must be `EXPENSE` or `INCOME`.
   - Optional color and icon must be safely validated.
3. Implement `GET /api/categories`:
   - Return all categories.
   - Support optional filtering by `type`.
   - Sort default or alphabetical order consistently.
4. Implement `POST /api/categories`:
   - Create a custom category.
   - Reject duplicate names with 409.
   - Default `is_default` should be 0 for user-created rows.
5. Implement `PUT /api/categories/:id`:
   - Validate ID.
   - Return 404 if missing.
   - Enforce unique name.
   - Update `updated_at`.
   - Decide whether default category names/types can be edited; recommended MVP behavior is to protect defaults from destructive changes.
6. Implement `DELETE /api/categories/:id`:
   - Validate ID.
   - Return 404 if missing.
   - Block deleting default categories.
   - Block deleting categories used by transactions with 409.
   - Delete only custom unused categories.
7. Implement payment method validation:
   - Name is required.
   - Name must be trimmed.
   - Name must be within a reasonable length.
8. Implement `GET /api/payment-methods`:
   - Return all payment methods.
   - Sort consistently.
9. Implement `POST /api/payment-methods`:
   - Create a custom payment method.
   - Reject duplicate names with 409.
10. Implement `PUT /api/payment-methods/:id`:
   - Validate ID.
   - Return 404 if missing.
   - Enforce unique name.
   - Update `updated_at`.
11. Implement `DELETE /api/payment-methods/:id`:
   - Validate ID.
   - Return 404 if missing.
   - Block deleting default payment methods.
   - Block deleting payment methods used by transactions with 409.
   - Delete only custom unused payment methods.
12. Use prepared statements for all database access.

## Validation/testing steps

- List categories.
- Filter categories by `EXPENSE` and `INCOME`.
- Create a custom expense category.
- Create a custom income category.
- Reject duplicate category name with 409.
- Update a custom category.
- Prevent deleting a default category.
- Prevent deleting a used category.
- Delete an unused custom category.
- List payment methods.
- Create, update, and delete a custom unused payment method.
- Reject duplicate payment method names with 409.
- Confirm unauthenticated requests return 401.
- Confirm unsupported methods return 405.

## Edge cases to handle

- Duplicate category name.
- Duplicate payment method name.
- Category type is invalid.
- Empty category name.
- Empty payment method name.
- Very long names.
- Invalid color value.
- Invalid icon value.
- Invalid ID.
- Record not found.
- Default category deletion.
- Default payment method deletion.
- Deleting category used by transactions.
- Deleting payment method used by transactions.
- D1 binding missing.

## Acceptance criteria

- All category and payment method endpoints exist and require authentication.
- Duplicate names return 409.
- Default records are protected from deletion.
- Used records cannot be deleted.
- Category type is enforced.
- `updated_at` changes on updates.
- All SQL uses prepared statements.
- Responses use the standard JSON format.

## Dependencies on previous phases

- Phase 02 authentication must be complete.
- Phase 03 D1 schema must be complete.
- Phase 04 shared API helpers must be complete.

## What must not be done in this phase

- Do not build frontend category or payment method pages.
- Do not implement transaction CRUD beyond checking usage.
- Do not implement dashboard stats.
- Do not allow deleting used/default records.
- Do not implement bank sync.

