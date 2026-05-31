# Phase 04: API Foundation and Shared Helpers

## Goal

Create reusable backend helpers for Cloudflare Pages Functions so later API phases are consistent, secure, and easy to validate.

## Scope

This phase builds shared backend utilities for:

- JSON success responses.
- JSON error responses.
- HTTP method handling.
- Request body parsing.
- Validation with Zod or custom helpers.
- Auth guard integration.
- D1 access validation.
- Common HTTP status codes.
- Safe production error handling.
- Date and money helper foundations if useful.

No domain-specific CRUD endpoints should be implemented in this phase except a simple health check if not already present.

## Files/folders likely to be created or changed

- `functions/api/health.js`
- `functions/_shared/json.js`
- `functions/_shared/errors.js`
- `functions/_shared/http.js`
- `functions/_shared/validation.js`
- `functions/_shared/auth.js`, if not already created
- `functions/_shared/db.js`
- `functions/_shared/dates.js`
- `functions/_shared/money.js`

## Step-by-step tasks

1. Create a standard JSON response helper:
   - Success format: `{ success: true, data }`.
   - Error format: `{ success: false, error: { message } }`.
   - Always set `content-type: application/json`.
2. Create an error response helper:
   - Support 400, 401, 403, 404, 405, 409, 429, and 500.
   - Avoid leaking raw production errors.
3. Create method handling utilities:
   - Allow only expected methods.
   - Return 405 for unsupported methods.
   - Include `Allow` header when practical.
4. Create request body parsing helper:
   - Safely parse JSON.
   - Return 400 for invalid JSON.
   - Limit assumptions about body shape.
5. Add validation helpers:
   - Use Zod if installed.
   - Otherwise implement narrow custom validation.
   - Prepare shared checks for strings, IDs, dates, amount inputs, pagination, and enum values.
6. Add D1 access helper:
   - Read `context.env.DB`.
   - Return safe 500 if missing.
   - Never expose D1 directly to the browser.
7. Add auth guard integration:
   - Reuse Phase 02 session verification.
   - Return 401 consistently for protected routes.
8. Add date helpers:
   - Validate `YYYY-MM-DD`.
   - Support Asia/Kolkata date calculations for later stats.
   - Validate inclusive date ranges.
9. Add money helpers:
   - Convert rupee input to integer paise safely.
   - Reject zero, negative, invalid decimal, and unreasonable large values.
10. Create or validate `GET /api/health`:
   - Return `{ success: true, data: { status: "ok" } }`.

## Validation/testing steps

- `GET /api/health` returns 200 with the standard JSON response format.
- Unsupported methods return 405.
- Invalid JSON parsing returns 400.
- Missing D1 binding returns a safe error where relevant.
- Validation helpers reject bad IDs, bad dates, bad amounts, invalid pagination, and invalid enums.
- Production-style error helper returns generic 500 messages.

## Edge cases to handle

- Request body is empty.
- Request body is malformed JSON.
- Request method is unsupported.
- `context.env.DB` is missing.
- `context.env` itself is unexpected in local development.
- Validation returns multiple errors.
- Date values look valid by regex but are impossible calendar dates.
- Amount strings include commas or more than two decimal places.
- Errors thrown by D1 should not leak raw details in production.

## Acceptance criteria

- Shared helpers exist and can be imported by later API routes.
- API responses use a consistent JSON shape.
- Invalid methods, invalid JSON, validation errors, auth failures, duplicate conflicts, not found, throttling, and internal errors have clear status behavior.
- D1 access goes through backend helpers only.
- The health endpoint works.
- No transaction, category, payment method, or stats CRUD is implemented yet.

## Dependencies on previous phases

- Phase 01 should be complete.
- Phase 02 should be complete or its auth helper interface must be finalized.
- Phase 03 is helpful for D1 validation but not required for all helpers.

## What must not be done in this phase

- Do not implement `/api/expenses` CRUD.
- Do not implement categories or payment methods CRUD.
- Do not implement `/api/stats`.
- Do not implement frontend pages.
- Do not expose raw production errors.
- Do not build SQL with concatenated user input.
- Do not implement bank sync.

