# Updated Expense Tracker Project Requirements

## 1. Project Goal

Build a personal expense tracker web application that can be hosted entirely on **Cloudflare free-tier infrastructure**.

The app should allow a user to manually add expenses and income, track spending, view summaries, analyze spending by category and time period, and securely store personal finance data.

The project must avoid paid infrastructure such as:

- VM
- VPS
- EC2
- DigitalOcean Droplet
- Paid backend hosting
- Paid managed database

Target deployment:

```text
React + Vite frontend
Cloudflare Pages
Cloudflare Pages Functions backend
Cloudflare D1 database
Optional Cloudflare KV for lightweight settings/cache/session throttling later
```

The first version should be simple, practical, secure enough for personal use, and reliable.

---

## 2. Important Scope Decision

### 2.1 Live Bank Account Connection Is Not Part of MVP

The MVP must **not** implement live SBI bank account sync or automatic bank transaction fetching.

Reasons:

- Live SBI sync usually requires India Account Aggregator integration.
- Account Aggregator providers may require approval, onboarding, business details, compliance review, or paid access.
- Bank credentials must never be collected directly inside this app.
- Manual expense tracking can be built and deployed immediately using free Cloudflare services.

### 2.2 Future Bank Sync Support

The app should be designed so bank sync can be added later.

For now, add only placeholder architecture for a future bank connection:

```text
Future module: bank-connections
Current status: not implemented in MVP
Recommended future flow: Account Aggregator provider integration
```

Rules:

```text
Do not ask users for SBI username/password.
Do not ask users for SBI password/OTP.
Do not call SBI APIs directly.
Do not implement live bank sync in MVP.
Do not implement Account Aggregator integration in MVP.
```

---

## 3. MVP Features

The MVP should include:

1. Simple personal-app authentication
2. Manual expense tracking
3. Manual income tracking
4. Add/edit/delete transactions
5. Categories
6. Payment methods
7. Dashboard statistics
8. Spending today
9. Spending this week
10. Spending this month
11. Spending by category
12. Recent transactions
13. Spending trend charts
14. Search, filters, sorting, and pagination
15. Cloudflare Pages deployment
16. Cloudflare Pages Functions API
17. Cloudflare D1 persistence
18. Mobile-friendly responsive UI
19. Safe validation and error handling

---

## 4. Authentication Requirement

Because this app stores personal financial data, authentication is mandatory for deployed MVP.

For MVP, use a simple personal-app password instead of full user accounts.

### 4.1 App Password Flow

Use an environment variable:

```text
APP_PASSWORD=your-strong-password
SESSION_SECRET=your-random-long-secret
```

Flow:

```text
User opens app
User enters app password
Backend verifies password
Backend creates signed session cookie
All protected API routes require the session cookie
User can logout and clear the cookie
```

### 4.2 Auth API Endpoints

```http
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me
```

### 4.3 Login Request

```json
{
  "password": "your-password"
}
```

### 4.4 Login Success Response

```json
{
  "success": true,
  "data": {
    "authenticated": true
  }
}
```

### 4.5 Session Cookie Rules

The session cookie must be:

```text
HttpOnly
Secure in production
SameSite=Lax or SameSite=Strict
Path=/
Expires after 7 or 30 days
```

Do not store the password in localStorage or sessionStorage.

### 4.6 Protected APIs

All APIs below must require authentication:

```text
/api/expenses
/api/categories
/api/payment-methods
/api/stats
/api/settings
/api/export, if implemented later
```

The following APIs can remain public:

```text
/api/health
/api/auth/login
```

### 4.7 Failed Login Protection

For MVP, implement basic protection against repeated wrong password attempts.

Acceptable simple implementation:

```text
Track failed login attempts by IP or temporary key.
After 5 failed attempts, block login for a short period such as 10 minutes.
Return 429 Too Many Requests.
```

If this is hard to implement cleanly in MVP, leave a clear TODO but keep the auth flow mandatory.

---

## 5. User-Facing Features

### 5.1 Manual Transaction Tracking

Users should be able to:

- Add a new expense
- Add income
- Edit a transaction
- Delete a transaction
- View all transactions
- Search transactions
- Filter transactions by date range
- Filter transactions by category
- Filter transactions by payment method
- Filter transactions by type: `EXPENSE`, `INCOME`, or `ALL`
- Sort transactions by date and created time
- Paginate transaction results

Each transaction should support:

```text
Type: EXPENSE or INCOME
Title
Amount
Category
Payment method
Transaction date
Merchant/source
Notes
Created timestamp
Updated timestamp
```

Example transactions:

```text
Food - Zomato - ₹250
Transport - Uber - ₹180
Shopping - Amazon - ₹1,499
Income - Salary - ₹50,000
Fuel - Petrol - ₹900
```

---

## 6. Money Handling Rules

Do not store money as floating-point values.

Use integer paise in the database.

```text
₹250.50 = 25050 paise
₹1,499 = 149900 paise
```

Database field:

```text
amount_paise INTEGER NOT NULL CHECK (amount_paise > 0)
```

Frontend can show and accept rupees, but the API should normalize to integer paise before writing to D1.

Validation:

```text
Amount is required.
Amount must be greater than 0.
Amount must not be negative.
Amount must support up to 2 decimal places.
Amount must be converted safely to paise.
Very large amounts should be rejected using a reasonable max limit.
```

Suggested maximum:

```text
Maximum amount per transaction: ₹10,00,00,000
Maximum amount in paise: 10000000000
```

---

## 7. Date and Timezone Rules

This personal app should use **Asia/Kolkata** as the default timezone for user-facing date calculations.

Rules:

```text
Store transaction_date as local date only in YYYY-MM-DD format.
Store created_at and updated_at as UTC timestamps.
Dashboard today/week/month calculations should use Asia/Kolkata local date.
Week starts on Monday by default unless changed in settings.
from and to date filters are inclusive.
```

Examples:

```text
transaction_date: 2026-05-30
created_at: 2026-05-30T15:25:30Z
updated_at: 2026-05-30T15:25:30Z
```

Validation:

```text
transaction_date is required.
transaction_date must match YYYY-MM-DD.
Invalid dates should return 400.
If from > to, return 400.
Future-dated transactions are allowed only if the user intentionally enters them.
```

---

## 8. Dashboard Statistics

The dashboard should show the following.

### 8.1 Today’s Spending

Total expense amount for the current local date in Asia/Kolkata.

Example:

```text
Today: ₹850 spent
```

### 8.2 This Week’s Spending

Total expense amount from the start of the current week to today.

Week should start on Monday by default.

If the `settings.week_start_day` value changes, stats should use the configured week start day.

Example:

```text
This week: ₹4,300 spent
```

### 8.3 This Month’s Spending

Total expense amount for the current calendar month.

Example:

```text
This month: ₹18,750 spent
```

### 8.4 Total Income

Total income for the selected period.

Example:

```text
Income: ₹50,000
```

### 8.5 Net Balance

Income minus expenses.

Example:

```text
Net balance: ₹31,250
```

### 8.6 Spending by Category

Example:

```text
Food: ₹5,200
Transport: ₹2,100
Shopping: ₹7,300
Fuel: ₹2,500
Bills: ₹3,000
```

### 8.7 Other Summary Cards

Show:

- Total expenses
- Total income
- Net balance
- Average daily spending
- Biggest expense
- Most used category
- Number of transactions
- Recent transactions

### 8.8 Trends and Charts

Charts should include:

- Daily spending for the last 7 days
- Monthly spending for current year
- Category-wise breakdown
- Income vs expense summary

### 8.9 Stats Edge Cases

The stats API must handle these cases:

```text
No transactions: return 0 values and empty arrays.
No expenses but income exists: expense values should be 0.
No income but expenses exist: income values should be 0.
Biggest expense should be null if no expenses exist.
Most used category should be null if no category exists.
Recent transactions should have a fixed limit, for example 5 or 10.
Daily trend should include missing days with amount 0.
Monthly trend should include missing months with amount 0.
```

---

## 9. Recommended Technology Stack

### 9.1 Frontend

Use the existing React Vite app.

Recommended packages:

```text
React
Vite
React Router
Tailwind CSS
Recharts
date-fns
lucide-react
```

Install:

```bash
npm install react-router-dom recharts date-fns lucide-react
```

Optional:

```bash
npm install clsx tailwind-merge
```

Use Recharts for charts and date-fns for date calculations.

### 9.2 Backend

Use Cloudflare Pages Functions.

Recommended backend structure:

```text
functions/
  api/
    health.js
    auth/
      login.js
      logout.js
      me.js
    expenses/
      index.js
      [id].js
    categories/
      index.js
      [id].js
    payment-methods/
      index.js
      [id].js
    stats/
      index.js
    settings/
      index.js
```

Pages Functions should use the D1 binding through:

```js
context.env.DB
```

### 9.3 Database

Use Cloudflare D1.

D1 should store:

- Transactions
- Categories
- Payment methods
- Settings
- Future bank connection placeholders if needed

D1 is preferred over KV for expense data because expense tracking needs SQL filtering, grouping, sorting, and date-based summaries.

### 9.4 KV Usage

KV is optional.

Do not use KV for core transaction data.

KV can be used later for:

- Cached dashboard stats
- Lightweight preferences
- Feature flags
- Temporary login throttling data
- Temporary tokens

For MVP, D1 alone is enough unless Codex cleanly implements login throttling with KV.

---

## 10. Deployment Architecture

```text
User Browser
    ↓
Cloudflare Pages static React app
    ↓
Cloudflare Pages Functions API
    ↓
Cloudflare D1 database
```

Example URLs:

```text
Frontend:
https://expenses-tracker-aw9.pages.dev

Custom domain:
https://tracker.manishbatchu.com

API:
https://tracker.manishbatchu.com/api/expenses
https://tracker.manishbatchu.com/api/stats
```

No VM, VPS, or paid server is needed.

---

## 11. Folder Structure

Use this structure:

```text
expenses-tracker/
  public/

  src/
    components/
      Layout.jsx
      Navbar.jsx
      StatCard.jsx
      ExpenseForm.jsx
      ExpenseTable.jsx
      CategoryChart.jsx
      TrendChart.jsx
      FilterBar.jsx
      ConfirmDialog.jsx
      EmptyState.jsx
      LoginForm.jsx
      LoadingState.jsx
      ErrorState.jsx

    pages/
      Login.jsx
      Dashboard.jsx
      Expenses.jsx
      AddExpense.jsx
      EditExpense.jsx
      Categories.jsx
      PaymentMethods.jsx
      Settings.jsx

    services/
      api.js
      auth.js

    utils/
      dateUtils.js
      currency.js
      validation.js

    App.jsx
    main.jsx
    index.css

  functions/
    api/
      health.js
      auth/
        login.js
        logout.js
        me.js
      expenses/
        index.js
        [id].js
      categories/
        index.js
        [id].js
      payment-methods/
        index.js
        [id].js
      stats/
        index.js
      settings/
        index.js

    _shared/
      json.js
      auth.js
      validation.js
      dates.js

  migrations/
    0001_initial.sql

  package.json
  vite.config.js
  wrangler.toml
  README.md
```

---

## 12. Database Schema

Create migration file:

```text
migrations/0001_initial.sql
```

### 12.1 Categories Table

```sql
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'EXPENSE' CHECK (type IN ('EXPENSE', 'INCOME')),
  color TEXT,
  icon TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Default categories:

```text
Expense:
Food
Transport
Shopping
Fuel
Bills
Rent
Health
Entertainment
Travel
Education
Other Expense

Income:
Salary
Freelance
Refund
Interest
Other Income
```

### 12.2 Payment Methods Table

```sql
CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Default payment methods:

```text
Cash
UPI
Debit Card
Credit Card
Net Banking
Wallet
Other
```

### 12.3 Transactions Table

Use one table for both expenses and income.

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),

  title TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),

  category_id INTEGER,
  payment_method_id INTEGER,

  transaction_date TEXT NOT NULL,

  merchant TEXT,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL
);
```

Important validation:

```text
If transaction.type = EXPENSE, category.type must be EXPENSE.
If transaction.type = INCOME, category.type must be INCOME.
```

### 12.4 Settings Table

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Initial settings:

```sql
INSERT OR IGNORE INTO settings (key, value)
VALUES
  ('currency', 'INR'),
  ('week_start_day', 'MONDAY'),
  ('theme', 'system'),
  ('timezone', 'Asia/Kolkata');
```

### 12.5 Future Bank Connections Placeholder Table

This table is optional for MVP.

It should exist only as a placeholder if Codex can add it cleanly without implementing bank sync.

```sql
CREATE TABLE IF NOT EXISTS bank_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT,
  bank_name TEXT,
  status TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
  consent_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Rules:

```text
Do not implement real bank connection in MVP.
Do not collect bank credentials.
Do not call any SBI API directly.
Do not implement Account Aggregator integration yet.
```

### 12.6 Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_transactions_date
ON transactions(transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_type
ON transactions(type);

CREATE INDEX IF NOT EXISTS idx_transactions_category
ON transactions(category_id);

CREATE INDEX IF NOT EXISTS idx_transactions_payment_method
ON transactions(payment_method_id);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
ON transactions(created_at);

CREATE INDEX IF NOT EXISTS idx_transactions_type_date
ON transactions(type, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_category_date
ON transactions(category_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_payment_method_date
ON transactions(payment_method_id, transaction_date);
```

### 12.7 Updated Timestamp Rule

Whenever updating rows in these tables, explicitly set `updated_at = CURRENT_TIMESTAMP`:

```text
transactions
categories
payment_methods
settings
bank_connections, if used later
```

---

## 13. Seed Data

Add default categories:

```sql
INSERT OR IGNORE INTO categories (name, type, color, icon, is_default)
VALUES
  ('Food', 'EXPENSE', '#ef4444', 'utensils', 1),
  ('Transport', 'EXPENSE', '#3b82f6', 'car', 1),
  ('Shopping', 'EXPENSE', '#a855f7', 'shopping-bag', 1),
  ('Fuel', 'EXPENSE', '#f97316', 'fuel', 1),
  ('Bills', 'EXPENSE', '#eab308', 'receipt', 1),
  ('Rent', 'EXPENSE', '#14b8a6', 'home', 1),
  ('Health', 'EXPENSE', '#22c55e', 'heart-pulse', 1),
  ('Entertainment', 'EXPENSE', '#ec4899', 'film', 1),
  ('Travel', 'EXPENSE', '#06b6d4', 'plane', 1),
  ('Education', 'EXPENSE', '#6366f1', 'book', 1),
  ('Other Expense', 'EXPENSE', '#64748b', 'circle', 1),
  ('Salary', 'INCOME', '#10b981', 'wallet', 1),
  ('Freelance', 'INCOME', '#22c55e', 'briefcase', 1),
  ('Refund', 'INCOME', '#06b6d4', 'rotate-ccw', 1),
  ('Interest', 'INCOME', '#6366f1', 'percent', 1),
  ('Other Income', 'INCOME', '#64748b', 'circle', 1);
```

Add default payment methods:

```sql
INSERT OR IGNORE INTO payment_methods (name, is_default)
VALUES
  ('Cash', 1),
  ('UPI', 1),
  ('Debit Card', 1),
  ('Credit Card', 1),
  ('Net Banking', 1),
  ('Wallet', 1),
  ('Other', 1);
```

---

## 14. Cloudflare Configuration

Create `wrangler.toml`.

```toml
name = "expenses-tracker"
compatibility_date = "2025-01-01"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "expenses-tracker-db"
database_id = "REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID"
```

The D1 binding name must be:

```text
DB
```

The functions should access it using:

```js
context.env.DB
```

Required environment variables:

```text
APP_PASSWORD
SESSION_SECRET
```

Do not expose these variables in React frontend code.

---

## 15. Development Commands

Install dependencies:

```bash
npm install
```

Install Wrangler:

```bash
npm install -D wrangler
```

Create D1 database:

```bash
npx wrangler d1 create expenses-tracker-db
```

Apply migrations locally:

```bash
npx wrangler d1 migrations apply expenses-tracker-db --local
```

Apply migrations remotely:

```bash
npx wrangler d1 migrations apply expenses-tracker-db --remote
```

Run Vite frontend:

```bash
npm run dev
```

Build frontend:

```bash
npm run build
```

Run Cloudflare Pages locally after build:

```bash
npx wrangler pages dev dist
```

If local D1 binding is not detected, run:

```bash
npx wrangler pages dev dist --d1 DB=<DATABASE_ID>
```

---

## 16. Cloudflare Pages Build Settings

Use these settings in Cloudflare Pages:

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: empty
```

Root directory should be empty if `package.json` is directly in the repository root.

Cloudflare Pages dashboard setup:

```text
Settings
Functions
D1 database bindings
Variable name: DB
Database: expenses-tracker-db
```

Environment variables:

```text
APP_PASSWORD
SESSION_SECRET
```

---

## 17. API Response Format

All API responses should be JSON.

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "message": "Something went wrong"
  }
}
```

### 17.1 HTTP Status Rules

Use proper HTTP status codes:

```text
200 - success
201 - created
204 - deleted with no response body, optional
400 - validation error
401 - not logged in
403 - forbidden, if needed later
404 - resource not found
405 - method not allowed
409 - duplicate category/payment method or delete conflict
429 - too many failed login attempts
500 - unexpected server error
```

Do not expose raw database errors in production.

Recommended behavior:

```text
In development: return useful error details.
In production: return a generic error message.
```

---

## 18. API Endpoints

### 18.1 Health Check

```http
GET /api/health
```

Response:

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

### 18.2 Auth

```http
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me
```

`/api/auth/me` response:

```json
{
  "success": true,
  "data": {
    "authenticated": true
  }
}
```

### 18.3 Get Transactions

```http
GET /api/expenses
```

Query parameters:

```text
type=EXPENSE
category_id=1
payment_method_id=2
from=2026-05-01
to=2026-05-31
search=zomato
limit=50
offset=0
sort=transaction_date_desc
```

Response:

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "limit": 50,
    "offset": 0
  }
}
```

The response should include category and payment method names using joins.

Filtering rules:

```text
type must be EXPENSE, INCOME, or ALL.
from and to are inclusive.
If only from is passed, return transactions from that date onward.
If only to is passed, return transactions up to that date.
If from > to, return 400.
Search should match title, merchant, and notes.
Search should be case-insensitive.
```

Pagination and sorting rules:

```text
Default sort: transaction_date DESC, created_at DESC
Default limit: 50
Maximum limit: 100
Offset must be >= 0
Invalid limit or offset should return 400
```

### 18.4 Create Transaction

```http
POST /api/expenses
```

Request:

```json
{
  "type": "EXPENSE",
  "title": "Zomato dinner",
  "amount": 250,
  "category_id": 1,
  "payment_method_id": 2,
  "transaction_date": "2026-05-30",
  "merchant": "Zomato",
  "notes": "Dinner"
}
```

Backend should convert `amount` rupees into `amount_paise`.

Validation:

```text
type must be EXPENSE or INCOME
title is required
title must not be empty after trim
title max length: 120 characters
amount is required
amount must be greater than 0
amount must not have more than 2 decimal places
transaction_date is required
transaction_date must be YYYY-MM-DD
category_id is optional
payment_method_id is optional
merchant max length: 120 characters
notes max length: 1000 characters
category type must match transaction type
```

### 18.5 Get Single Transaction

```http
GET /api/expenses/:id
```

If transaction does not exist, return 404.

### 18.6 Update Transaction

```http
PUT /api/expenses/:id
```

Request body is same as create transaction.

Rules:

```text
If transaction does not exist, return 404.
Update updated_at to CURRENT_TIMESTAMP.
Validate category type against transaction type.
```

### 18.7 Delete Transaction

```http
DELETE /api/expenses/:id
```

Response:

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

If transaction does not exist, return 404.

### 18.8 Get Categories

```http
GET /api/categories
```

Optional query:

```text
type=EXPENSE
type=INCOME
```

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Food",
      "type": "EXPENSE",
      "color": "#ef4444",
      "icon": "utensils"
    }
  ]
}
```

### 18.9 Create Category

```http
POST /api/categories
```

Request:

```json
{
  "name": "Subscriptions",
  "type": "EXPENSE",
  "color": "#8b5cf6",
  "icon": "repeat"
}
```

Validation:

```text
name is required
name must be unique
name max length: 80 characters
type must be EXPENSE or INCOME
color should be a valid hex color if provided
icon is optional
```

Duplicate category name should return 409.

### 18.10 Update Category

```http
PUT /api/categories/:id
```

Rules:

```text
If category does not exist, return 404.
Name must remain unique.
Update updated_at.
Changing type should be blocked if transactions already use this category.
```

### 18.11 Delete Category

```http
DELETE /api/categories/:id
```

Rules:

```text
If category does not exist, return 404.
If category is used by transactions, return 409.
If unused, delete it.
Default categories may be deleted only if unused, or deletion can be blocked for default categories.
```

Recommended MVP behavior:

```text
Do not allow deleting default categories.
Allow deleting only custom unused categories.
```

### 18.12 Get Payment Methods

```http
GET /api/payment-methods
```

### 18.13 Create Payment Method

```http
POST /api/payment-methods
```

Request:

```json
{
  "name": "PhonePe"
}
```

Duplicate payment method name should return 409.

### 18.14 Update Payment Method

```http
PUT /api/payment-methods/:id
```

Rules:

```text
If payment method does not exist, return 404.
Name must remain unique.
Update updated_at.
```

### 18.15 Delete Payment Method

```http
DELETE /api/payment-methods/:id
```

Rules:

```text
If payment method does not exist, return 404.
If payment method is used by transactions, return 409.
Default payment methods should not be deleted.
```

### 18.16 Dashboard Stats

```http
GET /api/stats
```

Optional query params:

```text
from=2026-05-01
to=2026-05-31
```

Response:

```json
{
  "success": true,
  "data": {
    "todaySpentPaise": 85000,
    "weekSpentPaise": 430000,
    "monthSpentPaise": 1875000,
    "totalIncomePaise": 5000000,
    "totalExpensePaise": 1875000,
    "netBalancePaise": 3125000,
    "averageDailySpendPaise": 62500,
    "transactionCount": 42,
    "biggestExpense": {
      "title": "Amazon headphones",
      "amountPaise": 249900
    },
    "mostUsedCategory": {
      "category": "Food",
      "count": 12
    },
    "categoryBreakdown": [
      {
        "category": "Food",
        "amountPaise": 520000,
        "color": "#ef4444"
      }
    ],
    "dailyTrend": [
      {
        "date": "2026-05-30",
        "amountPaise": 85000
      }
    ],
    "monthlyTrend": [
      {
        "month": "2026-05",
        "amountPaise": 1875000
      }
    ],
    "recentTransactions": []
  }
}
```

---

## 19. Backend Implementation Rules

### 19.1 Use Prepared Statements

Do this:

```js
const result = await context.env.DB.prepare(
  `INSERT INTO transactions
   (type, title, amount_paise, category_id, payment_method_id, transaction_date, merchant, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
)
.bind(type, title, amountPaise, categoryId, paymentMethodId, transactionDate, merchant, notes)
.run();
```

Do not build SQL by directly concatenating user input.

### 19.2 JSON Helper

Create a helper for JSON responses:

```js
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
```

### 19.3 Error Handling

Every API function should use try/catch.

```js
try {
  // DB logic
} catch (error) {
  return json({
    success: false,
    error: {
      message: "Internal server error"
    }
  }, 500);
}
```

Do not expose raw database errors to users in production.

### 19.4 Input Validation

Validate request bodies.

Use simple custom validation or Zod.

Recommended:

```bash
npm install zod
```

Validate:

```text
type
title
amount
transaction_date
category_id
payment_method_id
merchant
notes
category name
payment method name
settings values
```

### 19.5 Method Handling

Unsupported HTTP methods should return:

```text
405 Method Not Allowed
```

---

## 20. Frontend Pages

### 20.1 Login

Route:

```text
/login
```

Features:

- Password input
- Login button
- Error message for invalid password
- Loading state
- Redirect to dashboard after login

### 20.2 Dashboard

Route:

```text
/
```

Show:

- Today spent
- This week spent
- This month spent
- Total income
- Net balance
- Category chart
- Daily trend chart
- Recent transactions

Components:

```text
StatCard
CategoryChart
TrendChart
ExpenseTable
```

### 20.3 Expenses

Route:

```text
/expenses
```

Show:

- All transactions
- Filters
- Search
- Add button
- Edit button
- Delete button
- Pagination

Filters:

```text
Date range
Category
Payment method
Type
Search text
```

### 20.4 Add Expense / Income

Route:

```text
/expenses/new
```

Fields:

```text
Type
Title
Amount
Category
Payment method
Date
Merchant
Notes
```

After successful save:

```text
Redirect to /expenses
Show success message
```

### 20.5 Edit Expense / Income

Route:

```text
/expenses/:id/edit
```

Load existing transaction and prefill the form.

### 20.6 Categories

Route:

```text
/categories
```

Features:

- View categories
- Add custom category
- Edit category
- Delete custom unused category
- Prevent deleting default or used categories

### 20.7 Payment Methods

Route:

```text
/payment-methods
```

Features:

- View payment methods
- Add custom payment method
- Edit payment method
- Delete custom unused payment method
- Prevent deleting default or used payment methods

### 20.8 Settings

Route:

```text
/settings
```

Features:

- Currency setting
- Theme setting
- Week start day
- Timezone display
- Data export placeholder
- Delete all data placeholder
- Logout button

---

## 21. UI Requirements

The UI should be clean, modern, and mobile-friendly.

Support:

```text
Desktop
Tablet
Mobile
```

Suggested layout:

```text
Top navbar
Dashboard cards
Charts
Recent transactions
Responsive table/list
Mobile-friendly forms
```

Use Indian Rupee formatting by default.

Currency formatter:

```js
export function formatCurrencyFromPaise(amountPaise) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format((amountPaise || 0) / 100);
}
```

### 21.1 Frontend Edge States

Every page should handle:

```text
Loading state
Error state
Empty state
Unauthorized state
Network failure
Validation error messages
Successful save/delete messages
Delete confirmation dialog
```

---

## 22. Statistics SQL Ideas

### 22.1 Period Spending

Calculate start/end dates in JavaScript using Asia/Kolkata logic and pass them to SQL.

```sql
SELECT COALESCE(SUM(amount_paise), 0) AS total_paise
FROM transactions
WHERE type = 'EXPENSE'
AND transaction_date BETWEEN ? AND ?;
```

### 22.2 Category Breakdown

```sql
SELECT
  COALESCE(c.name, 'Uncategorized') AS category,
  c.color AS color,
  COALESCE(SUM(t.amount_paise), 0) AS amount_paise
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
WHERE t.type = 'EXPENSE'
AND t.transaction_date BETWEEN ? AND ?
GROUP BY c.id, c.name, c.color
ORDER BY amount_paise DESC;
```

### 22.3 Daily Trend

```sql
SELECT
  transaction_date AS date,
  COALESCE(SUM(amount_paise), 0) AS amount_paise
FROM transactions
WHERE type = 'EXPENSE'
AND transaction_date BETWEEN ? AND ?
GROUP BY transaction_date
ORDER BY transaction_date ASC;
```

After fetching SQL results, the backend should fill missing dates with zero values before returning to frontend.

### 22.4 Monthly Trend

For current year only:

```sql
SELECT
  SUBSTR(transaction_date, 1, 7) AS month,
  COALESCE(SUM(amount_paise), 0) AS amount_paise
FROM transactions
WHERE type = 'EXPENSE'
AND transaction_date BETWEEN ? AND ?
GROUP BY SUBSTR(transaction_date, 1, 7)
ORDER BY month ASC;
```

After fetching SQL results, the backend should fill missing months with zero values before returning to frontend.

---

## 23. Frontend API Service

Create:

```text
src/services/api.js
```

Example:

```js
const API_BASE = "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    credentials: "include",
    ...options
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.success === false) {
    throw new Error(data?.error?.message || "Request failed");
  }

  return data.data;
}

export const api = {
  login: (password) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password })
    }),

  logout: () =>
    request("/api/auth/logout", {
      method: "POST"
    }),

  me: () => request("/api/auth/me"),

  getStats: (query = "") => request(`/api/stats${query}`),

  getExpenses: (query = "") => request(`/api/expenses${query}`),

  getExpense: (id) => request(`/api/expenses/${id}`),

  createExpense: (payload) =>
    request("/api/expenses", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateExpense: (id, payload) =>
    request(`/api/expenses/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),

  deleteExpense: (id) =>
    request(`/api/expenses/${id}`, {
      method: "DELETE"
    }),

  getCategories: (query = "") => request(`/api/categories${query}`),

  createCategory: (payload) =>
    request("/api/categories", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateCategory: (id, payload) =>
    request(`/api/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),

  deleteCategory: (id) =>
    request(`/api/categories/${id}`, {
      method: "DELETE"
    }),

  getPaymentMethods: () => request("/api/payment-methods"),

  createPaymentMethod: (payload) =>
    request("/api/payment-methods", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updatePaymentMethod: (id, payload) =>
    request(`/api/payment-methods/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),

  deletePaymentMethod: (id) =>
    request(`/api/payment-methods/${id}`, {
      method: "DELETE"
    })
};
```

---

## 24. Security Rules

Codex must follow these rules:

```text
Do not store secrets in React frontend.
Do not expose D1 directly to browser.
Do not put API keys in src/.
Use Pages Functions for backend logic.
Use prepared SQL statements.
Validate all request bodies.
Do not allow zero or negative transaction amounts.
Use HTTPS only in production.
Protect delete actions with confirmation dialogs.
Do not collect bank credentials.
Do not implement direct SBI login.
Use HttpOnly cookies for sessions.
Do not store auth session tokens in localStorage.
Return 401 for unauthenticated API access.
Return 405 for unsupported HTTP methods.
Do not expose raw production errors.
```

---

## 25. Free Cloudflare Deployment Plan

### Step 1: Build React App

```bash
npm run build
```

Output:

```text
dist
```

### Step 2: Create D1 Database

```bash
npx wrangler d1 create expenses-tracker-db
```

Copy database ID into `wrangler.toml`.

### Step 3: Create Migration

Create:

```text
migrations/0001_initial.sql
```

### Step 4: Apply Migrations

Local:

```bash
npx wrangler d1 migrations apply expenses-tracker-db --local
```

Remote:

```bash
npx wrangler d1 migrations apply expenses-tracker-db --remote
```

### Step 5: Configure Cloudflare Pages

Settings:

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: empty
```

### Step 6: Bind D1 to Pages

Cloudflare Pages:

```text
Settings
Functions
D1 database bindings
Variable name: DB
Database: expenses-tracker-db
```

### Step 7: Add Environment Variables

Cloudflare Pages:

```text
Settings
Environment variables
APP_PASSWORD=<strong-password>
SESSION_SECRET=<long-random-secret>
```

### Step 8: Push to GitHub

```bash
git add .
git commit -m "add cloudflare d1 expense tracker"
git push origin main
```

Cloudflare Pages should automatically build and deploy.

---

## 26. MVP Implementation Order

Codex should implement in this order.

### Phase 1: Basic Frontend UI

Implement:

```text
Login page
Dashboard page
Expenses page
Add expense form
Edit expense form
Navbar
Responsive layout
```

Mock data can be used temporarily.

### Phase 2: D1 Schema and Migrations

Implement:

```text
migrations/0001_initial.sql
wrangler.toml
D1 database binding setup
Seed data
```

### Phase 3: Shared Backend Utilities

Implement:

```text
JSON helper
Auth/session helper
Validation helpers
Date helpers
Money conversion helpers
Error response helpers
```

### Phase 4: Auth API

Implement:

```text
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me
Session cookie handling
Protected route middleware/helper
```

### Phase 5: Core API Endpoints

Implement:

```text
GET /api/health
GET /api/categories
POST /api/categories
PUT /api/categories/:id
DELETE /api/categories/:id
GET /api/payment-methods
POST /api/payment-methods
PUT /api/payment-methods/:id
DELETE /api/payment-methods/:id
GET /api/expenses
POST /api/expenses
GET /api/expenses/:id
PUT /api/expenses/:id
DELETE /api/expenses/:id
GET /api/stats
```

### Phase 6: Connect Frontend to API

Replace mock data with real API calls.

Add:

```text
Loading states
Error states
Unauthorized redirect
Success messages
Delete confirmation
```

### Phase 7: Charts and Dashboard

Implement:

```text
Today spent card
Week spent card
Month spent card
Net balance card
Category chart
Daily trend chart
Monthly trend chart
Recent transactions
```

### Phase 8: Filters and Search

Implement:

```text
Date range filter
Category filter
Payment method filter
Type filter
Search input
Pagination
Sorting
```

### Phase 9: Polish

Implement:

```text
Mobile responsive UI
Empty states
Better form validation
Currency formatting
Date formatting
Better error handling
Accessibility basics
```

---

## 27. Future Features After MVP

Do not implement these until the MVP works.

```text
CSV import from SBI statement
CSV export of expenses
Monthly budgets
Recurring expenses
Category rules
Dark mode
PWA install support
PIN login
Cloudflare KV cached dashboard summary
Bank connection placeholder UI
AI auto-categorization
Receipt image upload
Email report
```

---

## 28. Explicitly Out of Scope for MVP

Do not implement these in the first version:

```text
Live SBI bank account sync
Account Aggregator integration
Plaid integration
GoCardless integration
Email notifications
SMS parsing
AI auto-categorization
Multi-user SaaS billing
Paid database
VM/VPS backend
Bank credential collection
SBI username/password login
OTP collection
```

---

## 29. Future SBI Bank Sync Plan

This section is only for future planning.

When the core app is complete, bank sync can be added through an India Account Aggregator provider.

Future flow:

```text
React app
  ↓
Cloudflare backend route
  ↓
Account Aggregator provider API
  ↓
User gives consent through official AA/bank flow
  ↓
Backend receives consent status
  ↓
Backend fetches transactions
  ↓
Transactions are normalized and saved in D1
  ↓
Dashboard shows bank transactions
```

Important future rules:

```text
Never collect SBI net banking username/password.
Never collect SBI password/OTP directly in this app.
Use official consent-based Account Aggregator flow only.
Store only consent reference IDs and normalized transactions.
Allow user to disconnect/revoke bank connection.
Deduplicate imported bank transactions.
Let user review imported transactions before final save, if possible.
```

Possible future providers to research:

```text
Setu
FinBox
Perfios / Anumati
OneMoney
FinVu
CAMSFinserv
```

This should be a separate phase after MVP.

---

## 30. Required Edge Cases

Codex must handle these edge cases:

```text
Unauthenticated user accessing /api/expenses
Wrong password repeatedly
Invalid transaction ID
Deleting a transaction that does not exist
Editing a transaction that does not exist
Duplicate category name
Duplicate payment method name
Deleting category/payment method that is already used
Deleting default category/payment method
Income transaction using expense category
Expense transaction using income category
Amount = 0
Negative amount
Very large amount
Invalid decimal amount
Invalid date format
Future-dated transaction
from date greater than to date
Invalid limit/offset
Empty title
Very long title/notes/merchant
No transactions yet
No expenses but income exists
No income but expenses exist
Stats with empty data
Daily trend missing zero-value days
Monthly trend missing zero-value months
Network/API failure on frontend
D1 binding missing in local/prod environment
Unsupported HTTP method
Production error should not expose raw DB error
```

---

## 31. Acceptance Criteria

The project is complete when:

```text
User can login using app password.
Unauthenticated users cannot access personal finance APIs.
User can add an expense.
User can add income.
User can edit a transaction.
User can delete a transaction.
User can view all transactions.
User can filter transactions.
User can search transactions.
User can paginate transactions.
User can manage custom categories.
User can manage custom payment methods.
Dashboard shows today’s spending.
Dashboard shows this week’s spending.
Dashboard shows this month’s spending.
Dashboard shows category-wise spending.
Dashboard shows daily trend chart.
Dashboard handles empty data correctly.
Money is stored as integer paise, not floating point.
Dates are handled using Asia/Kolkata user-facing logic.
Data persists in Cloudflare D1.
Project deploys successfully on Cloudflare Pages.
No paid infrastructure is required.
No bank credentials are collected.
Live bank sync is not implemented in MVP.
```

---

## 32. Codex Implementation Instructions

Codex should:

```text
1. Inspect the existing Vite React project.
2. Do not rewrite the entire app unnecessarily.
3. Add Cloudflare Pages Functions under /functions.
4. Add D1 migration under /migrations.
5. Add wrangler.toml.
6. Add reusable React components.
7. Implement simple app-password authentication.
8. Protect personal finance API routes.
9. Implement API service layer.
10. Use D1 prepared statements.
11. Store money as integer paise.
12. Use Asia/Kolkata for user-facing date calculations.
13. Add validation and proper error status codes.
14. Keep the app free-tier Cloudflare compatible.
15. Avoid any paid service dependency.
16. Do not implement live bank sync in MVP.
17. Do not collect bank credentials.
18. Do not expose secrets in frontend code.
```

---

## 33. Prompt to Give Codex

Use this prompt:

```text
Implement the expense tracker according to UPDATED_PROJECT_REQUIREMENTS.md.

This is a React + Vite app deployed on Cloudflare Pages. Add Cloudflare Pages Functions for backend APIs and Cloudflare D1 for persistence. Do not use a VM, VPS, paid backend, or paid database.

Implement the MVP first:
- Simple app-password login
- Protected personal finance APIs
- Manual add/edit/delete expenses
- Manual add/edit/delete income
- Categories
- Payment methods
- Dashboard stats
- Spending today
- Spending this week
- Spending this month
- Spending by category
- Daily spending trend chart
- D1 migrations
- Cloudflare Pages Functions API
- Frontend connected to API
- Proper validation and error handling
- Mobile-friendly UI

Important implementation rules:
- Store money as integer paise, not floating-point REAL.
- Use Asia/Kolkata for user-facing today/week/month date calculations.
- Use prepared SQL statements.
- Validate all input.
- Return proper HTTP status codes.
- Protect all personal finance APIs behind session auth.
- Do not expose secrets in frontend code.

Do not implement live SBI bank sync in the MVP. Do not collect bank credentials. Design the app so bank sync can be added later through an Account Aggregator provider.

Use the architecture, schema, API routes, UI flows, edge cases, and implementation order described in UPDATED_PROJECT_REQUIREMENTS.md.
```

---

## 34. Final Architecture Summary

```text
Frontend: React + Vite
Hosting: Cloudflare Pages
Backend: Cloudflare Pages Functions
Database: Cloudflare D1
Auth: Simple app password + signed HttpOnly session cookie
Money storage: Integer paise
Timezone: Asia/Kolkata for user-facing stats
Optional future cache/settings: Cloudflare KV
Paid infrastructure: none
Bank sync: future phase only
```

The main priority is to build a working, simple, secure personal expense tracker first.

Bank sync can be added later only after the manual tracker, secure backend, and database foundation are working properly.
