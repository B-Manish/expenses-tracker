import {
  CalendarClock,
  ChevronDown,
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
import { Button } from "./ui/button.jsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.jsx";
import { Separator } from "./ui/separator.jsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet.jsx";

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

function NavList({ onNavigate, pathname }) {
  return (
    <nav className="primary-nav" aria-label="Primary navigation">
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={navClassName({ to }, pathname)}
          onClick={onNavigate}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function QuickActions({ onNavigate }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="w-full justify-between" type="button" variant="outline">
          Quick actions
          <ChevronDown size={16} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Shortcuts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/expenses/new" onClick={onNavigate}>
            <PlusCircle size={16} aria-hidden="true" />
            Add transaction
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/expenses" onClick={onNavigate}>
            <ReceiptText size={16} aria-hidden="true" />
            View transactions
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" onClick={onNavigate}>
            <Settings size={16} aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent({ isLoggingOut, onLogout, onNavigate, pathname }) {
  return (
    <div className="sidebar-inner">
      <BrandLockup />
      <Separator />

      <NavList onNavigate={onNavigate} pathname={pathname} />

      <div className="sidebar-card" aria-label="Quick action">
        <span className="sidebar-card-icon" aria-hidden="true">
          <PlusCircle size={18} />
        </span>
        <div>
          <strong>Keep the ledger fresh</strong>
          <p>Add income or spending as soon as it happens.</p>
        </div>
        <Button asChild className="sidebar-card-action">
          <Link to="/expenses/new" onClick={onNavigate}>
            Add transaction
          </Link>
        </Button>
        <QuickActions onNavigate={onNavigate} />
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
        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <SheetTrigger asChild>
            <Button
              className="mobile-menu-button"
              size="icon"
              type="button"
              variant="outline"
              aria-label={isMenuOpen ? "Close navigation" : "Open navigation"}
            >
              {isMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[300px] p-4" side="left">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>Primary app navigation and quick actions.</SheetDescription>
            </SheetHeader>
            <SidebarContent
              isLoggingOut={isLoggingOut}
              onLogout={onLogout}
              onNavigate={closeMenu}
              pathname={pathname}
            />
          </SheetContent>
        </Sheet>
      </header>

      <aside className={isMenuOpen ? "app-sidebar open" : "app-sidebar"} id="app-sidebar">
        <SidebarContent
          isLoggingOut={isLoggingOut}
          onLogout={onLogout}
          onNavigate={closeMenu}
          pathname={pathname}
        />
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}
