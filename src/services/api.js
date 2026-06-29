export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? null;
    this.data = options.data ?? null;
  }
}

function hasJsonContent(response) {
  return response.headers.get("content-type")?.toLowerCase().includes("application/json");
}

async function readResponseBody(response) {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  if (!hasJsonContent(response)) {
    throw new ApiError("API returned a non-JSON response.", {
      status: response.status,
    });
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("API returned invalid JSON.", {
      status: response.status,
    });
  }
}

function normalizeQuery(query) {
  if (!query) {
    return "";
  }

  if (typeof query === "string") {
    if (!query.trim()) {
      return "";
    }

    return query.startsWith("?") ? query : `?${query}`;
  }

  const params = query instanceof URLSearchParams
    ? query
    : new URLSearchParams(
        Object.entries(query).filter(([, value]) => (
          value !== undefined &&
          value !== null &&
          value !== ""
        )),
      );
  const queryString = params.toString();

  return queryString ? `?${queryString}` : "";
}

function withQuery(path, query) {
  return `${path}${normalizeQuery(query)}`;
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (hasBody && !isFormData && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let response;

  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError("Network request failed. Please check your connection.");
  }

  const payload = await readResponseBody(response);
  const message = payload?.error?.message;

  if (!response.ok || payload?.success === false) {
    throw new ApiError(message || `Request failed with status ${response.status}.`, {
      status: response.status,
      data: payload,
    });
  }

  if (payload && Object.prototype.hasOwnProperty.call(payload, "success")) {
    return payload.data ?? null;
  }

  return payload;
}

function jsonRequest(path, method, payload) {
  return request(path, {
    method,
    body: JSON.stringify(payload),
  });
}

export const api = {
  login: (email, password) => jsonRequest("/api/auth/login", "POST", { email, password }),
  requestSignupCode: (payload) => jsonRequest("/api/auth/signup/request", "POST", payload),
  verifySignupCode: (email, code) => jsonRequest("/api/auth/signup/verify", "POST", { email, code }),
  requestPasswordReset: (email) => jsonRequest("/api/auth/password-reset/request", "POST", { email }),
  verifyPasswordReset: (email, code) => jsonRequest("/api/auth/password-reset/verify", "POST", { email, code }),
  completePasswordReset: (token, password) => jsonRequest("/api/auth/password-reset/complete", "POST", { token, password }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  me: () => request("/api/auth/me"),

  getStats: (query) => request(withQuery("/api/stats", query)),

  getSettings: () => request("/api/settings"),
  updateSettings: (payload) => jsonRequest("/api/settings", "PUT", payload),

  getExpenses: (query) => request(withQuery("/api/expenses", query)),
  getExpense: (id) => request(`/api/expenses/${id}`),
  createExpense: (payload) => jsonRequest("/api/expenses", "POST", payload),
  updateExpense: (id, payload) => jsonRequest(`/api/expenses/${id}`, "PUT", payload),
  deleteExpense: (id) => request(`/api/expenses/${id}`, { method: "DELETE" }),

  getSmsImports: (query) => request(withQuery("/api/sms-imports", query)),
  confirmSmsImport: (id) => jsonRequest(`/api/sms-imports/${id}/confirm`, "POST", {}),

  getRecurringExpenses: () => request("/api/recurring-expenses"),
  getRecurringExpense: (id) => request(`/api/recurring-expenses/${id}`),
  createRecurringExpense: (payload) => jsonRequest("/api/recurring-expenses", "POST", payload),
  updateRecurringExpense: (id, payload) => jsonRequest(`/api/recurring-expenses/${id}`, "PUT", payload),
  deleteRecurringExpense: (id) => request(`/api/recurring-expenses/${id}`, { method: "DELETE" }),

  getCategories: (query) => request(withQuery("/api/categories", query)),
  createCategory: (payload) => jsonRequest("/api/categories", "POST", payload),
  updateCategory: (id, payload) => jsonRequest(`/api/categories/${id}`, "PUT", payload),
  deleteCategory: (id) => request(`/api/categories/${id}`, { method: "DELETE" }),

  getPaymentMethods: () => request("/api/payment-methods"),
  createPaymentMethod: (payload) => jsonRequest("/api/payment-methods", "POST", payload),
  updatePaymentMethod: (id, payload) => jsonRequest(`/api/payment-methods/${id}`, "PUT", payload),
  deletePaymentMethod: (id) => request(`/api/payment-methods/${id}`, { method: "DELETE" }),
};
