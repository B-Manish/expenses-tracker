import {
  CalendarClock,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  ReceiptText,
  Settings,
  Tags,
  WalletCards,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/expenses", label: "Transactions", icon: ReceiptText },
  { to: "/expenses/new", label: "Add transaction", icon: PlusCircle },
  { to: "/recurring-expenses", label: "Recurring", icon: CalendarClock },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/payment-methods", label: "Payments", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

function navClassName(item, pathname) {
  return ({ isActive }) => {
    const isAddRoute = pathname === "/expenses/new";
    const isTransactionEditRoute = /^\/expenses\/[^/]+\/edit$/.test(pathname);
    const shouldHighlightTransactions = item.to === "/expenses" && isTransactionEditRoute;
    const shouldSuppressTransactions = item.to === "/expenses" && isAddRoute;
    const active = (isActive && !shouldSuppressTransactions) || shouldHighlightTransactions;

    return active ? "nav-link active" : "nav-link";
  };
}

function BrandLockup() {
  return (
    <Link className="brand-lockup" to="/" aria-label="Expense Tracker dashboard">
      <span className="brand-mark" aria-hidden="true">
        <WalletCards size={21} />
      </span>
      <span>
        <span className="brand-name">Expense Tracker</span>
        <span className="brand-context">Personal finance</span>
      </span>
    </Link>
  );
}

export default function AppShell({ children, isLoggingOut = false, onLogout }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { pathname } = useLocation();

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <BrandLockup />
        <button
          className="icon-button mobile-menu-button"
          type="button"
          aria-label={isMenuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={isMenuOpen}
          aria-controls="app-sidebar"
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          {isMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </header>

      <button
        className={isMenuOpen ? "mobile-scrim open" : "mobile-scrim"}
        type="button"
        aria-label="Close navigation"
        onClick={closeMenu}
      />

      <aside className={isMenuOpen ? "app-sidebar open" : "app-sidebar"} id="app-sidebar">
        <div className="sidebar-inner">
          <BrandLockup />

          <nav className="primary-nav" aria-label="Primary navigation">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={navClassName({ to }, pathname)}
                onClick={closeMenu}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-card" aria-label="Quick action">
            <span className="sidebar-card-icon" aria-hidden="true">
              <PlusCircle size={18} />
            </span>
            <div>
              <strong>Keep the ledger fresh</strong>
              <p>Add income or spending as soon as it happens.</p>
            </div>
            <Link className="button primary-button sidebar-card-action" to="/expenses/new" onClick={closeMenu}>
              Add transaction
            </Link>
          </div>

          <button
            className="nav-link nav-button"
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
          >
            <LogOut size={18} aria-hidden="true" />
            <span>{isLoggingOut ? "Signing out" : "Logout"}</span>
          </button>
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}
