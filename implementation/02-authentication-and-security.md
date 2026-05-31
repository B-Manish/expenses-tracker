# Phase 02: Authentication and Security

## Goal

Implement simple personal-app authentication and shared security rules for protected API access.

## Scope

This phase adds backend authentication using:

- `APP_PASSWORD` environment variable.
- `SESSION_SECRET` environment variable.
- `POST /api/auth/login`.
- `POST /api/auth/logout`.
- `GET /api/auth/me`.
- Signed session cookie.
- Protected API helper or middleware.
- Failed-login throttling or a clearly documented MVP-safe fallback.

The session cookie must be:

- `HttpOnly`.
- `Secure` in production.
- `SameSite=Lax` or `SameSite=Strict`.
- `Path=/`.
- Expiring after a fixed duration, such as 7 or 30 days.

All personal finance APIs must be designed to require the session cookie. Public routes are limited to `GET /api/health` and `POST /api/auth/login`.

## Files/folders likely to be created or changed

- `functions/api/auth/login.js`
- `functions/api/auth/logout.js`
- `functions/api/auth/me.js`
- `functions/_shared/auth.js`
- `functions/_shared/json.js`, if not created earlier
- `functions/_shared/security.js`, if useful
- `README.md`, only for local environment notes if needed

## Step-by-step tasks

1. Define session design:
   - Use a signed cookie generated with `SESSION_SECRET`.
   - Store only minimal session data, such as an issued timestamp and expiry timestamp.
   - Do not store the app password in the cookie.
2. Implement cookie signing and verification:
   - Use Web Crypto APIs available in Cloudflare Workers/Pages Functions.
   - Reject missing, expired, malformed, or invalidly signed cookies.
3. Implement `POST /api/auth/login`:
   - Parse JSON body.
   - Validate `password` is a non-empty string.
   - Compare against `context.env.APP_PASSWORD`.
   - On success, set signed session cookie and return `{ success: true, data: { authenticated: true } }`.
   - On wrong password, return 401.
4. Implement failed-login protection:
   - Prefer a simple D1 or KV-backed failed attempt tracker when available.
   - Block after 5 failed attempts for about 10 minutes.
   - Return 429 when blocked.
   - If storage is not available yet, document the limitation clearly and keep the auth flow mandatory.
5. Implement `POST /api/auth/logout`:
   - Clear the session cookie.
   - Return success.
6. Implement `GET /api/auth/me`:
   - Return authenticated true when the cookie is valid.
   - Return authenticated false or 401 consistently when not logged in.
7. Implement an auth guard helper:
   - Reuse it in later protected API routes.
   - Return 401 for unauthenticated requests.
8. Add environment validation:
   - Missing `APP_PASSWORD` should fail safely.
   - Missing `SESSION_SECRET` should fail safely.
9. Ensure secrets are never exposed to the React frontend.

## Validation/testing steps

- Login with the correct password returns 200 and sets an `HttpOnly` session cookie.
- Login with a wrong password returns 401.
- Repeated failed login attempts eventually return 429 if throttling is implemented.
- Logout clears the cookie.
- `/api/auth/me` returns authenticated state correctly.
- Protected helper rejects requests with no cookie.
- Protected helper rejects tampered or expired cookies.
- Response bodies follow the standard JSON success/error format.

## Edge cases to handle

- Missing `APP_PASSWORD`.
- Missing `SESSION_SECRET`.
- Empty password.
- Non-JSON request body.
- Malformed cookie.
- Tampered cookie signature.
- Expired cookie.
- Logout when already logged out.
- Cloudflare local development over HTTP where `Secure` cookie behavior differs from production.
- Multiple wrong password attempts from the same IP or temporary key.

## Acceptance criteria

- Auth endpoints exist and use the required routes.
- Successful login creates a signed secure session cookie.
- Logout clears the session.
- Auth status can be checked with `/api/auth/me`.
- A reusable protected-route helper exists for later APIs.
- Unauthenticated API access can return 401.
- Secrets remain only in environment variables and backend code.
- D1 is not exposed directly to the browser.

## Dependencies on previous phases

- Phase 01 should be complete so Wrangler and Cloudflare baseline config exist.

## What must not be done in this phase

- Do not build transaction CRUD.
- Do not build category or payment method CRUD.
- Do not build dashboard stats.
- Do not create frontend login UI unless explicitly required for manual testing.
- Do not store passwords or session tokens in localStorage or sessionStorage.
- Do not place `APP_PASSWORD` or `SESSION_SECRET` in React source code.
- Do not implement SBI login, OTP collection, or bank sync.

