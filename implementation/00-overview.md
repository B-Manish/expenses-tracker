# Phase 00: Overview

## Goal

Summarize the complete expense tracker implementation plan and define the architecture, MVP scope, exclusions, and phase-by-phase implementation strategy before any application code is changed.

## Scope

The project is a personal expense tracker built on free-tier Cloudflare infrastructure:

- Frontend: existing React + Vite application.
- Hosting: Cloudflare Pages.
- Backend: Cloudflare Pages Functions.
- Database: Cloudflare D1.
- Optional future storage: Cloudflare KV only for lightweight cache, settings, throttling, or feature flags.
- Authentication: personal app password with secure session cookie.
- Money storage: integer paise, never floating point.
- User-facing timezone: Asia/Kolkata.

The MVP includes manual expense and income tracking, categories, payment methods, dashboard statistics, search, filters, sorting, pagination, authentication, validation, and Cloudflare deployment.

The MVP explicitly excludes:

- VM, VPS, EC2, DigitalOcean Droplet, paid backend hosting, or paid managed database.
- Live SBI bank sync.
- Direct SBI API calls.
- Account Aggregator implementation.
- Collection of bank username, password, OTP, or net banking credentials.
- Multi-user SaaS features or billing.

Future bank sync may be designed as a placeholder only. Any real implementation must use an Account Aggregator-style consent flow and must not collect bank credentials.

## Files/folders likely to be created or changed

This planning phase creates only documentation files:

- `implementation/00-overview.md`
- `implementation/progress.md`
- `implementation/prompt.md`

Future implementation phases may create or change:

- `package.json`
- `package-lock.json`
- `wrangler.toml`
- `migrations/`
- `functions/`
- `src/`
- `README.md`

## Step-by-step tasks

1. Read `UPDATED_PROJECT_REQUIREMENTS.md` or fall back to `PROJECT_REQUIREMENTS.md`.
2. Confirm the final architecture uses React + Vite, Cloudflare Pages, Cloudflare Pages Functions, and Cloudflare D1.
3. Confirm Cloudflare KV is optional and not used for core transaction data.
4. Confirm no VM, VPS, or paid backend is needed.
5. Confirm live SBI bank sync and bank credential collection are out of scope.
6. Split the project into focused implementation phases.
7. Create one Markdown file per phase under `implementation/`.
8. Create `implementation/progress.md` as the phase tracker.
9. Create `implementation/prompt.md` as the reusable continuation prompt.

## Validation/testing steps

- Verify all requested phase files exist in `implementation/`.
- Verify no application source files were modified in this planning phase.
- Verify Phase 00 is marked `Completed` in `implementation/progress.md`.
- Verify all other phases are marked `Not Started`.
- Verify the current phase points to `01-project-setup-and-cloudflare-baseline.md`.

## Edge cases to handle

- If `UPDATED_PROJECT_REQUIREMENTS.md` is missing, use `PROJECT_REQUIREMENTS.md`.
- If `implementation/` already contains files, avoid overwriting user edits without checking them first.
- If requirements conflict, prioritize explicit security and scope rules.
- If future bank sync appears in requirements, keep it as placeholder planning only.

## Acceptance criteria

- All required Markdown files are created under `implementation/`.
- The overview clearly states the Cloudflare free-tier architecture.
- The overview clearly states that live SBI sync is not part of the MVP.
- The overview clearly states that bank credentials must never be collected.
- The phase sequence is detailed enough to hand one phase at a time to Codex later.
- No application source code, config, migrations, API files, or React components are created in this phase.

## Dependencies on previous phases

None. This is the planning overview phase.

## What must not be done in this phase

- Do not implement app features.
- Do not create React components.
- Do not create API routes.
- Do not create database migrations.
- Do not create or modify Cloudflare config.
- Do not install dependencies.
- Do not implement live bank sync.
- Do not collect or request SBI credentials.

