import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "./api.js";
import { getErrorMessage } from "../utils/validation.js";

const AuthContext = createContext(null);

function unauthenticatedState() {
  return {
    status: "unauthenticated",
    error: null,
  };
}

function authenticatedState(session) {
  return {
    status: session?.authenticated ? "authenticated" : "unauthenticated",
    error: null,
  };
}

function authErrorState(error) {
  if (error instanceof ApiError && error.status === 401) {
    return unauthenticatedState();
  }

  return {
    status: "error",
    error: getErrorMessage(error),
  };
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: "checking",
    error: null,
  });

  const refreshAuth = useCallback(async () => {
    setState({
      status: "checking",
      error: null,
    });

    try {
      const session = await api.me();

      setState(authenticatedState(session));
    } catch (error) {
      setState(authErrorState(error));
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;

    api.me()
      .then((session) => {
        if (isCurrent) {
          setState(authenticatedState(session));
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setState(authErrorState(error));
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const session = await api.login(email, password);

    setState({
      status: session?.authenticated ? "authenticated" : "unauthenticated",
      error: null,
    });

    return session;
  }, []);

  const requestSignupCode = useCallback((payload) => api.requestSignupCode(payload), []);

  const verifySignupCode = useCallback(async (email, code) => {
    const session = await api.verifySignupCode(email, code);

    setState({
      status: session?.authenticated ? "authenticated" : "unauthenticated",
      error: null,
    });

    return session;
  }, []);

  const requestPasswordReset = useCallback((email) => api.requestPasswordReset(email), []);

  const verifyPasswordReset = useCallback((email, code) => api.verifyPasswordReset(email, code), []);

  const completePasswordReset = useCallback((token, password) => (
    api.completePasswordReset(token, password)
  ), []);

  // Called by pages when an API request returns 401 so route guards see the
  // expired session instead of bouncing /login back to a protected route.
  const markUnauthenticated = useCallback(() => {
    setState(unauthenticatedState());
  }, []);

  const logout = useCallback(async () => {
    let logoutError = null;

    try {
      await api.logout();
    } catch (error) {
      logoutError = error;
    } finally {
      setState(unauthenticatedState());
    }

    if (logoutError) {
      throw logoutError;
    }
  }, []);

  const value = useMemo(() => ({
    error: state.error,
    isAuthenticated: state.status === "authenticated",
    isChecking: state.status === "checking",
    login,
    logout,
    markUnauthenticated,
    completePasswordReset,
    requestPasswordReset,
    requestSignupCode,
    refreshAuth,
    status: state.status,
    verifyPasswordReset,
    verifySignupCode,
  }), [
    completePasswordReset,
    login,
    logout,
    markUnauthenticated,
    requestPasswordReset,
    requestSignupCode,
    refreshAuth,
    state.error,
    state.status,
    verifyPasswordReset,
    verifySignupCode,
  ]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
