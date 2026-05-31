# Phase 07: Dashboard Stats API

## Goal

Implement the authenticated dashboard statistics API for summaries, trends, category breakdowns, and recent transactions.

## Scope

This phase implements:

- `GET /api/stats`
- Today spending.
- This week spending.
- This month spending.
- Total income.
- Total expense.
- Net balance.
- Average daily spending.
- Biggest expense.
- Most used category.
- Transaction count.
- Category breakdown.
- Daily trend.
- Monthly trend.
- Recent transactions.
- Empty-state behavior.
- Zero-value days and months for charts.
- Asia/Kolkata date calculations.

## Files/folders likely to be created or changed

- `functions/api/stats/index.js`
- `functions/_shared/dates.js`
- `functions/_shared/stats.js`, if useful
- `functions/_shared/db.js`
- `functions/_shared/auth.js`
- `functions/_shared/validation.js`

## Step-by-step tasks

1. Protect `GET /api/stats` with the auth helper.
2. Support optional `from` and `to` query parameters:
   - Validate `YYYY-MM-DD`.
   - Treat both as inclusive.
   - Return 400 when `from > to`.
3. Implement Asia/Kolkata current date helper:
   - Determine local today.
   - Determine current week start using `settings.week_start_day`, default Monday.
   - Determine current month start/end.
4. Query today spending:
   - Sum expense `amount_paise` for local today.
5. Query this week spending:
   - Sum expense `amount_paise` from week start through today.
6. Query this month spending:
   - Sum expense `amount_paise` for current local month.
7. Query selected-period totals:
   - Total income.
   - Total expense.
   - Net balance.
   - Transaction count.
8. Calculate average daily spending:
   - Use the selected period length or a clear default period.
   - Avoid division by zero.
9. Query biggest expense:
   - Return null when no expenses exist.
10. Query most used category:
   - Return null when no category usage exists.
11. Query category breakdown:
   - Include category name, amount, and color.
   - Use `Uncategorized` when category is null.
12. Query daily trend:
   - Return the last 7 days or selected date range, depending on requirements chosen.
   - Fill missing days with `amountPaise: 0`.
13. Query monthly trend:
   - Return all months in the current year.
   - Fill missing months with `amountPaise: 0`.
14. Query recent transactions:
   - Use a fixed limit such as 5 or 10.
15. Return the required response shape:
   - `todaySpentPaise`
   - `weekSpentPaise`
   - `monthSpentPaise`
   - `totalIncomePaise`
   - `totalExpensePaise`
   - `netBalancePaise`
   - `averageDailySpendPaise`
   - `transactionCount`
   - `biggestExpense`
   - `mostUsedCategory`
   - `categoryBreakdown`
   - `dailyTrend`
   - `monthlyTrend`
   - `recentTransactions`

## Validation/testing steps

- Stats with no transactions return zero values and empty arrays/nulls where appropriate.
- Stats with only income return expense values as 0.
- Stats with only expenses return income values as 0.
- Today, week, and month values use Asia/Kolkata local dates.
- Week start respects `settings.week_start_day` when implemented.
- Category breakdown groups expenses correctly.
- Daily trend includes zero-value missing days.
- Monthly trend includes zero-value missing months.
- Recent transactions return the expected limit and order.
- Invalid date filters return 400.
- Unauthenticated requests return 401.
- Unsupported methods return 405.

## Edge cases to handle

- No transactions.
- No expenses but income exists.
- No income but expenses exist.
- Biggest expense should be null if none exists.
- Most used category should be null if none exists.
- Missing category should not break breakdown.
- `from > to`.
- Invalid date format.
- Impossible calendar date.
- Timezone boundary around midnight UTC vs Asia/Kolkata.
- Missing `week_start_day` setting.
- D1 binding missing.
- Production database error should not expose raw details.

## Acceptance criteria

- `GET /api/stats` exists and requires authentication.
- All required stat fields are returned.
- Date calculations use Asia/Kolkata.
- Empty states are stable and frontend-friendly.
- Zero-value chart periods are included.
- All SQL uses prepared statements.
- Responses use the standard JSON format.

## Dependencies on previous phases

- Phase 02 authentication must be complete.
- Phase 03 D1 schema must be complete.
- Phase 04 shared API helpers must be complete.
- Phase 05 transaction API should be complete enough to create data for testing.

## What must not be done in this phase

- Do not build dashboard UI.
- Do not implement frontend chart components.
- Do not create transaction CRUD UI.
- Do not cache core stats in KV unless explicitly planned and safe.
- Do not implement bank sync.

