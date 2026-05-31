import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import EmptyState from "./components/EmptyState.jsx";
import ErrorState from "./components/ErrorState.jsx";
import Layout from "./components/Layout.jsx";
import LoadingState from "./components/LoadingState.jsx";
import AddExpense from "./pages/AddExpense.jsx";
import Categories from "./pages/Categories.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import EditExpense from "./pages/EditExpense.jsx";
import Expenses from "./pages/Expenses.jsx";
import Login from "./pages/Login.jsx";
import PaymentMethods from "./pages/PaymentMethods.jsx";
import Settings from "./pages/Settings.jsx";
import { AuthProvider, useAuth } from "./services/auth.js";

function ProtectedRoute() {
  const location = useLocation();
  const { error, isAuthenticated, isChecking, refreshAuth } = useAuth();

  if (isChecking) {
    return <LoadingState title="Checking session" message="One moment while your session is verified." />;
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
    return <LoadingState title="Checking session" message="One moment while your session is verified." />;
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
        message="That route does not exist in this expense tracker."
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
      <AppRoutes />
    </AuthProvider>
  );
}
