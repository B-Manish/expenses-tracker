# Phase 01: Project Setup and Cloudflare Baseline

## Goal

Prepare the existing React + Vite project for Cloudflare Pages, Pages Functions, and D1 without implementing product features.

## Scope

This phase establishes the baseline toolchain and deployment configuration:

- Inspect the existing Vite project structure.
- Install required frontend/backend helper dependencies.
- Install Wrangler as a development dependency.
- Add or validate `wrangler.toml`.
- Confirm local build commands.
- Document Cloudflare Pages build settings.
- Prepare for local Pages Functions development.
- Ensure the D1 binding name is exactly `DB`.

No user-facing app features should be implemented in this phase.

## Files/folders likely to be created or changed

- `package.json`
- `package-lock.json`
- `wrangler.toml`
- `README.md`, only if setup notes are needed

Do not create feature files yet under `src/`, `functions/`, or `migrations/` unless a minimal placeholder is strictly required for configuration validation.

## Step-by-step tasks

1. Inspect the existing project:
   - Confirm `package.json` exists at the repository root.
   - Confirm the app is React + Vite.
   - Review current scripts such as `dev`, `build`, and `preview`.
2. Install recommended runtime dependencies:
   - `react-router-dom`
   - `recharts`
   - `date-fns`
   - `lucide-react`
   - `zod`, if validation will use Zod later
3. Install Wrangler:
   - `npm install -D wrangler`
4. Add or validate `wrangler.toml`:
   - `name = "expenses-tracker"`
   - `compatibility_date` set to a recent stable date.
   - `pages_build_output_dir = "dist"`
   - D1 database binding with `binding = "DB"`.
   - `database_name = "expenses-tracker-db"`.
   - Placeholder `database_id` if the D1 database has not been created yet.
5. Confirm local build works:
   - `npm run build`
6. Document Cloudflare Pages settings:
   - Framework preset: Vite.
   - Build command: `npm run build`.
   - Build output directory: `dist`.
   - Root directory: empty when `package.json` is in the repository root.
7. Document local Pages Functions development:
   - Build first with `npm run build`.
   - Run with `npx wrangler pages dev dist`.
   - If D1 binding is not detected, run with `--d1 DB=<DATABASE_ID>`.
8. Confirm the required environment variables for later phases:
   - `APP_PASSWORD`
   - `SESSION_SECRET`

## Validation/testing steps

- Run `npm install` successfully after dependency changes.
- Run `npm run build` successfully.
- Run `npx wrangler --version` successfully.
- If practical, run `npx wrangler pages dev dist` and confirm the static app serves locally.
- Inspect `wrangler.toml` and confirm the D1 binding is named `DB`.

## Edge cases to handle

- `wrangler.toml` already exists with a different binding name.
- `database_id` is not available yet.
- Existing project scripts differ from default Vite scripts.
- Build fails because of existing app issues unrelated to this phase.
- Local Pages dev command cannot bind D1 until the database is created.
- Network access may be needed to install packages.

## Acceptance criteria

- Required dependencies are present in `package.json`.
- Wrangler is installed as a dev dependency.
- `wrangler.toml` exists and is compatible with Cloudflare Pages.
- The D1 binding name is exactly `DB`.
- `npm run build` succeeds or any pre-existing blocker is documented.
- No app features, APIs, database migrations, or UI flows are implemented.

## Dependencies on previous phases

- Phase 00 must be complete.

## What must not be done in this phase

- Do not create authentication endpoints.
- Do not create D1 migrations.
- Do not build transaction APIs.
- Do not build React pages or components.
- Do not add mock product UI.
- Do not implement bank sync.
- Do not add secrets to frontend code or committed files.

