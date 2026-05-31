# Phase 13: Cloudflare Deployment and Verification

## Goal

Deploy the completed MVP to Cloudflare Pages with Cloudflare D1 and verify the production environment.

## Scope

This phase covers:

- Build.
- D1 create.
- Local migration.
- Remote migration.
- Cloudflare Pages settings.
- D1 binding in the dashboard.
- Environment variables.
- Deployment verification checklist.
- Manual smoke tests after deploy.
- Common Cloudflare troubleshooting.

## Files/folders likely to be created or changed

- `wrangler.toml`
- `README.md`, for deployment notes if useful
- No source code changes unless deployment reveals a defect that must be fixed.

## Step-by-step tasks

1. Confirm local build:
   - `npm run build`
2. Create D1 database if not already created:
   - `npx wrangler d1 create expenses-tracker-db`
3. Copy the returned database ID into `wrangler.toml`.
4. Apply migrations locally:
   - `npx wrangler d1 migrations apply expenses-tracker-db --local`
5. Apply migrations remotely:
   - `npx wrangler d1 migrations apply expenses-tracker-db --remote`
6. Configure Cloudflare Pages:
   - Framework preset: Vite.
   - Build command: `npm run build`.
   - Build output directory: `dist`.
   - Root directory: empty if `package.json` is at the repo root.
7. Configure D1 binding in Cloudflare Pages:
   - Variable name: `DB`.
   - Database: `expenses-tracker-db`.
8. Add Cloudflare environment variables:
   - `APP_PASSWORD`
   - `SESSION_SECRET`
9. Deploy through Cloudflare Pages.
10. Verify production routes:
   - Static app loads.
   - `GET /api/health`.
   - Login.
   - Protected API returns 401 when logged out.
   - Protected API works when logged in.
11. Run smoke tests:
   - Add expense.
   - Add income.
   - Edit transaction.
   - Delete transaction.
   - Manage custom category.
   - Manage custom payment method.
   - View dashboard stats.
   - Check mobile layout.
12. Review deployment logs for errors.
13. Document any deployment-specific troubleshooting notes.

## Validation/testing steps

- `npm run build` succeeds.
- D1 database exists.
- Local migration succeeds.
- Remote migration succeeds.
- Cloudflare Pages build succeeds.
- D1 binding `DB` is visible in Cloudflare Pages settings.
- `APP_PASSWORD` and `SESSION_SECRET` exist in Cloudflare Pages environment variables.
- Production login works.
- Production transaction CRUD works.
- Production dashboard stats work.
- No unauthenticated access to personal finance APIs.
- No bank credential collection exists in production UI.

## Edge cases to handle

- D1 database ID missing from `wrangler.toml`.
- Binding name is not exactly `DB`.
- Remote migration fails because it was already applied.
- Pages Functions not detected.
- Environment variables missing in production.
- Secure cookie works differently between local HTTP and production HTTPS.
- Build command differs from Cloudflare dashboard settings.
- Root directory is incorrectly configured.
- D1 binding configured for preview but not production.
- Production logs show raw errors.

## Acceptance criteria

- App is deployed successfully on Cloudflare Pages.
- Cloudflare D1 persists production data.
- Pages Functions APIs work in production.
- Auth protects personal finance APIs.
- Manual smoke tests pass after deployment.
- No paid infrastructure is required.
- No live bank sync is implemented.
- No bank credentials are collected.

## Dependencies on previous phases

- Phases 01 through 12 should be complete.
- Cloudflare account access is required.

## What must not be done in this phase

- Do not add new features during deployment unless fixing a deployment blocker.
- Do not commit real secrets.
- Do not expose `APP_PASSWORD` or `SESSION_SECRET` to React.
- Do not rename the D1 binding away from `DB`.
- Do not switch to paid backend infrastructure.
- Do not implement live bank sync.

