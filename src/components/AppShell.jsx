import {
  CalendarClock,
  CreditCard,
  Home,
  LayoutGrid,
  LogOut,
  MessageSquareText,
  Plus,
  ReceiptText,
  Settings,
  Tags,
  Target,
  WalletCards,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import ThemeToggle from "./ThemeToggle.jsx";
import { Separator } from "./ui/separator.jsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet.jsx";

const menuItems = [
  { to: "/", label: "Dashboard", icon: Home, end: true },
  { to: "/expenses", label: "Transactions", icon: ReceiptText, end: true },
  { to: "/expenses/new", label: "Add transaction", icon: Plus },
  { to: "/recurring-expenses", label: "Recurring", icon: CalendarClock },
  { to: "/budgets", label: "Budgets", icon: Target },
  { to: "/sms-imports", label: "SMS Inbox", icon: MessageSquareText },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/payment-methods", label: "Payments", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

// Two items each side of the centered floating add button. Remaining routes
// (Settings, Recurring, Categories, Payments, SMS) live in the More sheet.
const bottomNavItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/expenses", label: "Entries", icon: ReceiptText, end: true },
  { to: "/budgets", label: "Budgets", icon: Target },
];

// Routes reachable only through the mobile "More" sheet; the More trigger
// shows the active state when one of them is open.
const moreRoutes = ["/recurring-expenses", "/sms-imports", "/categories", "/payment-methods", "/settings"];

function routeTitle(pathname) {
  if (pathname === "/expenses/new") {
    return "Add transaction";
  }

  if (/^\/expenses\/[^/]+\/edit$/.test(pathname)) {
    return "Edit transaction";
  }

  return menuItems.find((item) => item.to === pathname)?.label || "";
}

function bottomNavClassName({ isActive }) {
  return isActive ? "bottom-nav-item active" : "bottom-nav-item";
}

function menuClassName({ isActive }) {
  return isActive ? "nav-link active" : "nav-link";
}

function BrandLockup() {
  return (
    <Link className="brand-lockup" to="/" aria-label="Cashly dashboard">
      <span className="brand-mark" aria-hidden="true">
        <WalletCards size={20} />
      </span>
      <span>
        <span className="brand-name">Cashly</span>
        <span className="brand-context">Personal finance</span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }) {
  return (
    <nav className="primary-nav" aria-label="Primary navigation">
      {menuItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink className={menuClassName} end={end} key={to} onClick={onNavigate} to={to}>
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function LogoutButton({ isLoggingOut, onLogout }) {
  return (
    <button className="nav-link nav-button" disabled={isLoggingOut} onClick={onLogout} type="button">
      <LogOut size={18} aria-hidden="true" />
      <span>{isLoggingOut ? "Signing out" : "Logout"}</span>
    </button>
  );
}

function MoreMenu({ isLoggingOut, onLogout }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const isActive = moreRoutes.some((route) => pathname.startsWith(route));

  function close() {
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-current={isActive ? "page" : undefined}
          className={isActive ? "bottom-nav-item active" : "bottom-nav-item"}
          type="button"
          aria-label="More navigation"
        >
          <LayoutGrid size={22} aria-hidden="true" />
          <span>More</span>
        </button>
      </SheetTrigger>
      <SheetContent className="w-[300px] p-4" side="left">
        <SheetHeader className="text-left">
          <SheetTitle>
            <BrandLockup />
          </SheetTitle>
          <SheetDescription className="sr-only">Primary navigation and quick actions.</SheetDescription>
        </SheetHeader>

        <Separator className="my-4" />

        <NavList onNavigate={close} />

        <div className="sidebar-footer">
          <ThemeToggle />
          <LogoutButton
            isLoggingOut={isLoggingOut}
            onLogout={() => {
              close();
              onLogout();
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function AppShell({ children, isLoggingOut = false, onLogout }) {
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  const isAddActive = pathname === "/expenses/new";

  // On route change: reset the scroll container (persistent .app-main is the
  // mobile scroller), update the tab title, and move focus to the new page
  // heading so keyboard and screen-reader users hear the navigation.
  useEffect(() => {
    mainRef.current?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);

    const title = routeTitle(pathname);

    document.title = title ? `${title} — Cashly` : "Cashly";

    const heading = mainRef.current?.querySelector("h1");

    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }, [pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="app-sidebar" id="app-sidebar">
        <div className="sidebar-inner">
          <BrandLockup />
          <Separator />
          <NavList />
          <div className="sidebar-footer">
            <ThemeToggle />
            <LogoutButton isLoggingOut={isLoggingOut} onLogout={onLogout} />
          </div>
        </div>
      </aside>

      <main className="app-main" id="main-content" ref={mainRef}>{children}</main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <NavLink className={bottomNavClassName} end={bottomNavItems[0].end} to={bottomNavItems[0].to}>
          <Home size={22} aria-hidden="true" />
          <span>{bottomNavItems[0].label}</span>
        </NavLink>
        <NavLink className={bottomNavClassName} end={bottomNavItems[1].end} to={bottomNavItems[1].to}>
          <ReceiptText size={22} aria-hidden="true" />
          <span>{bottomNavItems[1].label}</span>
        </NavLink>

        <span className="bottom-nav-spacer" aria-hidden="true" />

        <NavLink className={bottomNavClassName} to={bottomNavItems[2].to}>
          <Target size={22} aria-hidden="true" />
          <span>{bottomNavItems[2].label}</span>
        </NavLink>
        <MoreMenu isLoggingOut={isLoggingOut} onLogout={onLogout} />

        <Link
          aria-current={isAddActive ? "page" : undefined}
          aria-label="Add transaction"
          className={isAddActive ? "fab active" : "fab"}
          to="/expenses/new"
        >
          <Plus size={26} aria-hidden="true" />
        </Link>
      </nav>
    </div>
  );
}
