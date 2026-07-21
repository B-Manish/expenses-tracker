import { Suspense, lazy } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import EmptyState from "./components/EmptyState.jsx";
import ErrorState from "./components/ErrorState.jsx";
import Layout from "./components/Layout.jsx";
import LoadingState from "./components/LoadingState.jsx";
import { AuthProvider, useAuth } from "./services/auth.js";

// Route-level code splitting: the login screen no longer downloads the whole
// app (charts included); each page loads on first visit.
const AddExpense = lazy(() => import("./pages/AddExpense.jsx"));
const Budgets = lazy(() => import("./pages/Budgets.jsx"));
const Categories = lazy(() => import("./pages/Categories.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const EditExpense = lazy(() => import("./pages/EditExpense.jsx"));
const Expenses = lazy(() => import("./pages/Expenses.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const PaymentMethods = lazy(() => import("./pages/PaymentMethods.jsx"));
const RecurringExpenses = lazy(() => import("./pages/RecurringExpenses.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const SmsImports = lazy(() => import("./pages/SmsImports.jsx"));

function ProtectedRoute() {
  const location = useLocation();
  const { error, isAuthenticated, isChecking, refreshAuth } = useAuth();

  if (isChecking) {
    return <LoadingState title="Checking session" />;
  }

  if (error && !isAuthenticated) {
    return (
      <main className="standalone-shell">
        <ErrorState
          title="Session check failed"
          message={error}
          actionLabel="Try again"
          onRetry={refreshAuth}
        />
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

function GuestOnlyRoute() {
  const { isAuthenticated, isChecking } = useAuth();

  if (isChecking) {
    return <LoadingState title="Checking session" />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function NotFoundPage() {
  return (
    <section className="page-section narrow-section">
      <EmptyState
        title="Page not found"
        message="That route does not exist in Cashly."
        action={
          <Link className="button primary-button" to="/">
            Go to dashboard
          </Link>
        }
      />
    </section>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestOnlyRoute />}>
        <Route path="/login" element={<Login />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/expenses/new" element={<AddExpense />} />
          <Route path="/expenses/:id/edit" element={<EditExpense />} />
          <Route path="/recurring-expenses" element={<RecurringExpenses />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/sms-imports" element={<SmsImports />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/payment-methods" element={<PaymentMethods />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<LoadingState title="Loading page" />}>
        <AppRoutes />
      </Suspense>
    </AuthProvider>
  );
}
