# Phase 11: Settings Page and Future Placeholders

## Goal

Build the settings experience and safe future-feature placeholders without implementing out-of-scope features.

## Scope

This phase covers:

- Currency setting.
- Theme setting.
- Week start day setting.
- Timezone display.
- Data export placeholder.
- Delete all data placeholder.
- Logout access if not already present.
- Bank connection placeholder UI only.
- Explicitly no real bank sync.
- Explicitly no SBI login, OTP, password, or credential collection.

Settings may be read from and written to the backend if the settings API exists. If settings persistence is not implemented yet, placeholders must be clear and safe.

## Files/folders likely to be created or changed

- `src/pages/Settings.jsx`
- `src/components/ConfirmDialog.jsx`
- `src/services/api.js`
- `src/services/auth.js`
- `src/utils/validation.js`
- `functions/api/settings/index.js`, only if settings API persistence is included in this phase
- `functions/_shared/validation.js`, only if settings API persistence is included

## Step-by-step tasks

1. Review whether a settings API exists.
2. If implementing settings API in this phase:
   - Protect it with auth.
   - Support reading settings.
   - Support updating allowed settings only.
   - Validate values.
3. Build settings page sections:
   - Currency: default `INR`.
   - Theme: `system`, `light`, or `dark` if supported.
   - Week start day: default `MONDAY`.
   - Timezone: display `Asia/Kolkata`.
4. Add data export placeholder:
   - Make clear that export is not implemented yet.
   - Do not create a fake export.
5. Add delete all data placeholder:
   - Make clear that destructive deletion is not implemented yet unless explicitly required.
   - If a disabled action is shown, it must not delete data.
6. Add bank connection placeholder UI:
   - Show status such as `Not connected`.
   - Explain future support should use consent-based Account Aggregator flow.
   - Do not include fields for bank username, password, OTP, card details, or net banking credentials.
7. Add logout action if not already available elsewhere.
8. Ensure page uses existing layout and loading/error patterns.

## Validation/testing steps

- Settings page loads for authenticated user.
- Unauthenticated user is redirected or blocked.
- Currency displays as INR.
- Timezone displays as Asia/Kolkata.
- Week start day can be displayed and, if implemented, updated.
- Theme setting does not break the UI.
- Export placeholder does not download fake data.
- Delete all data placeholder does not delete data.
- Bank placeholder has no credential inputs.
- Logout works from settings if present.
- App builds with `npm run build`.

## Edge cases to handle

- Settings table has missing keys.
- Settings API is unavailable.
- Invalid setting value.
- Network failure while loading or saving settings.
- Unsupported theme.
- Unsupported week start day.
- User expects bank sync from placeholder.
- Placeholder accidentally includes credential fields.
- Mobile layout with multiple settings sections.

## Acceptance criteria

- Settings page exists and is reachable.
- Currency, theme, week start day, and timezone are represented.
- Future export and delete-all-data areas are placeholders only unless explicitly implemented.
- Bank connection is a placeholder only.
- No SBI username, password, OTP, or bank credential input exists.
- No live bank sync or Account Aggregator integration is implemented.

## Dependencies on previous phases

- Phase 08 frontend routing and API service must be complete.
- Phase 02 auth should be complete.
- Phase 03 settings table should exist if settings persistence is implemented.

## What must not be done in this phase

- Do not implement live SBI sync.
- Do not implement Account Aggregator integration.
- Do not collect bank credentials.
- Do not call SBI APIs.
- Do not implement destructive delete-all-data behavior unless explicitly requested.
- Do not implement export unless explicitly included and validated.
- Do not add paid services.

