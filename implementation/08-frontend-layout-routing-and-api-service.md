# Phase 08: Frontend Layout, Routing, and API Service

## Goal

Create the frontend application shell, routes, API service layer, and authentication state handling.

## Scope

This phase connects the React + Vite app structure to the backend APIs without building the full detailed transaction or dashboard UI yet.

It covers:

- React Router setup.
- Main layout.
- Navbar.
- Pages:
  - Dashboard
  - Expenses
  - Add Expense
  - Edit Expense
  - Categories
  - Settings
  - Login
- API service layer.
- Auth state handling.
- Protected routes.
- Loading, error, and success patterns.

## Files/folders likely to be created or changed

- `src/App.jsx`
- `src/main.jsx`
- `src/index.css`
- `src/components/Layout.jsx`
- `src/components/Navbar.jsx`
- `src/components/LoadingState.jsx`
- `src/components/ErrorState.jsx`
- `src/components/EmptyState.jsx`
- `src/components/LoginForm.jsx`
- `src/pages/Login.jsx`
- `src/pages/Dashboard.jsx`
- `src/pages/Expenses.jsx`
- `src/pages/AddExpense.jsx`
- `src/pages/EditExpense.jsx`
- `src/pages/Categories.jsx`
- `src/pages/PaymentMethods.jsx`
- `src/pages/Settings.jsx`
- `src/services/api.js`
- `src/services/auth.js`
- `src/utils/currency.js`
- `src/utils/dateUtils.js`
- `src/utils/validation.js`

## Step-by-step tasks

1. Install or confirm `react-router-dom` is available.
2. Set up browser routing:
   - `/login`
   - `/`
   - `/expenses`
   - `/expenses/new`
   - `/expenses/:id/edit`
   - `/categories`
   - `/payment-methods`
   - `/settings`
3. Create a protected route pattern:
   - Check `/api/auth/me`.
   - Redirect unauthenticated users to `/login`.
   - Keep authenticated users away from login when appropriate.
4. Create the main layout:
   - Top navbar.
   - Responsive content area.
   - Mobile-friendly navigation.
5. Create placeholder page shells:
   - Dashboard.
   - Expenses.
   - Add Expense.
   - Edit Expense.
   - Categories.
   - Payment Methods.
   - Settings.
6. Create the API service layer:
   - Use `fetch`.
   - Use `credentials: "include"`.
   - Parse standard JSON response format.
   - Throw meaningful errors.
   - Include methods for auth, stats, expenses, categories, and payment methods.
7. Create auth service/state:
   - Login.
   - Logout.
   - Current user/authenticated state.
   - Loading state while checking session.
8. Add reusable state components:
   - Loading.
   - Error.
   - Empty.
9. Add basic currency/date utilities:
   - Format integer paise as INR.
   - Display dates consistently.
10. Keep page content minimal but connected enough for later phases.

## Validation/testing steps

- App builds with `npm run build`.
- `/login` renders.
- Protected routes redirect to login when unauthenticated.
- Successful login redirects to dashboard.
- Logout clears auth state and returns to login.
- API service sends cookies with requests.
- API errors are displayed through shared error patterns.
- Navigation works on desktop and mobile widths.

## Edge cases to handle

- `/api/auth/me` network failure.
- Expired session cookie.
- Login failure.
- Logout failure.
- User refreshes a protected route.
- Unknown route.
- API returns non-JSON response.
- API returns standard error response.
- Mobile navigation wrapping or overflow.

## Acceptance criteria

- React Router is configured.
- Main layout and navbar exist.
- Required page routes exist.
- Auth state gates protected routes.
- API service layer uses `credentials: "include"`.
- Secrets are not stored in frontend code.
- App builds successfully.

## Dependencies on previous phases

- Phase 01 dependencies should be installed.
- Phase 02 auth API should be complete.
- Phase 04 API response format should be complete.
- Phases 05-07 are helpful for API integration but detailed UI can be completed later.

## What must not be done in this phase

- Do not build full transaction forms and tables.
- Do not build final dashboard charts.
- Do not implement backend routes.
- Do not store auth tokens in localStorage or sessionStorage.
- Do not expose secrets in React code.
- Do not implement bank sync.

