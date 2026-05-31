import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../services/auth.js";
import { getErrorMessage } from "../utils/validation.js";
import AppShell from "./AppShell.jsx";

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      navigate("/login", {
        replace: true,
        state: {
          notice: `Signed out locally. ${getErrorMessage(error, "Server logout did not complete.")}`,
        },
      });
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <AppShell isLoggingOut={isLoggingOut} onLogout={handleLogout}>
      <Outlet />
    </AppShell>
  );
}
