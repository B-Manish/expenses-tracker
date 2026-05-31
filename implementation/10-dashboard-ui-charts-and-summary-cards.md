# Phase 10: Dashboard UI, Charts, and Summary Cards

## Goal

Build the frontend dashboard experience using the stats API.

## Scope

This phase implements:

- Dashboard stat cards.
- Category chart.
- Daily trend chart.
- Monthly trend chart.
- Income vs expense summary.
- Recent transactions.
- Mobile responsive dashboard.
- Chart empty states.
- Loading and error states.

## Files/folders likely to be created or changed

- `src/pages/Dashboard.jsx`
- `src/components/StatCard.jsx`
- `src/components/CategoryChart.jsx`
- `src/components/TrendChart.jsx`
- `src/components/ExpenseTable.jsx`, if recent transactions reuse it
- `src/components/EmptyState.jsx`
- `src/components/LoadingState.jsx`
- `src/components/ErrorState.jsx`
- `src/services/api.js`
- `src/utils/currency.js`
- `src/utils/dateUtils.js`
- `src/index.css`

## Step-by-step tasks

1. Fetch `GET /api/stats` when the dashboard loads.
2. Add loading state while stats are pending.
3. Add error state with retry behavior if practical.
4. Create summary cards for:
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
5. Build category breakdown chart:
   - Use Recharts.
   - Use category color when available.
   - Show empty state when no expenses exist.
6. Build daily trend chart:
   - Display zero-value days returned by the API.
   - Format date labels clearly.
7. Build monthly trend chart:
   - Display zero-value months returned by the API.
   - Format month labels clearly.
8. Build income vs expense summary:
   - Show comparison visually and numerically.
   - Handle missing income or missing expenses.
9. Build recent transactions section:
   - Use API-provided recent transactions.
   - Link to edit or full expenses page where appropriate.
10. Make dashboard responsive:
   - Cards should reflow on tablet/mobile.
   - Charts should not overflow.
   - Text should fit in compact cards.
11. Keep chart and dashboard visuals consistent with the rest of the app.

## Validation/testing steps

- Dashboard loads stats successfully.
- All required stat cards render.
- Category chart renders with real data.
- Daily trend chart renders zero-value days.
- Monthly trend chart renders zero-value months.
- Empty stats show clear empty states, not broken charts.
- Recent transactions render and link correctly.
- Dashboard works at desktop, tablet, and mobile widths.
- Network/API failure shows an error state.
- App builds with `npm run build`.

## Edge cases to handle

- No transactions.
- No expenses but income exists.
- No income but expenses exist.
- Biggest expense is null.
- Most used category is null.
- Empty category breakdown.
- Empty recent transactions.
- Very large amounts.
- Negative net balance.
- Long transaction titles.
- Chart container too narrow on mobile.
- API returns unexpected null fields.

## Acceptance criteria

- Dashboard uses the real stats API.
- All required summary cards and charts are implemented.
- Empty, loading, and error states are handled.
- Charts remain readable and responsive.
- INR formatting is consistent.
- Dashboard builds and works without mock data.

## Dependencies on previous phases

- Phase 07 stats API must be complete.
- Phase 08 frontend routing and API service must be complete.
- Phase 09 transaction UI may provide reusable table/card components.

## What must not be done in this phase

- Do not implement backend stats changes unless fixing a defect.
- Do not implement transaction CRUD UI beyond recent transaction display.
- Do not implement settings or bank placeholders.
- Do not add paid charting libraries.
- Do not implement bank sync.

