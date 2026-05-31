import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  ReceiptText,
  Settings,
  Tags,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/expenses", label: "Expenses", icon: ReceiptText },
  { to: "/expenses/new", label: "Add", icon: PlusCircle },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/payment-methods", label: "Payments", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

function navClassName({ isActive }) {
  return isActive ? "nav-link active" : "nav-link";
}

export default function Navbar({ isLoggingOut = false, onLogout }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="app-header">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">IN</div>
        <div>
          <p className="brand-name">Expense Tracker</p>
          <p className="brand-context">Personal finance</p>
        </div>
      </div>

      <button
        className="icon-button mobile-menu-button"
        type="button"
        aria-label={isMenuOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={isMenuOpen}
        aria-controls="primary-navigation"
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        {isMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>

      <nav
        id="primary-navigation"
        className={isMenuOpen ? "primary-nav open" : "primary-nav"}
        aria-label="Primary navigation"
      >
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={navClassName} onClick={() => setIsMenuOpen(false)}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          className="nav-link nav-button"
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
        >
          <LogOut size={18} aria-hidden="true" />
          <span>{isLoggingOut ? "Signing out" : "Logout"}</span>
        </button>
      </nav>
    </header>
  );
}
