import { errorResponse, methodNotAllowedError, badRequest } from "./errors.js";

export const METHODS = Object.freeze({
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  OPTIONS: "OPTIONS",
});

function normalizeMethods(methods) {
  return methods.map((method) => method.toUpperCase());
}

export function allowMethods(request, allowedMethods) {
  const allowed = normalizeMethods(allowedMethods);

  if (allowed.includes(request.method.toUpperCase())) {
    return null;
  }

  return errorResponse(methodNotAllowedError(allowed));
}

export async function readJsonBody(request, options = {}) {
  const { required = true } = options;
  const text = await request.text();

  if (!text.trim()) {
    if (!required) {
      return {
        ok: true,
        data: null,
      };
    }

    return {
      ok: false,
      error: badRequest("Request body is required"),
      response: errorResponse(badRequest("Request body is required")),
    };
  }

  try {
    return {
      ok: true,
      data: JSON.parse(text),
    };
  } catch {
    const error = badRequest("Request body must be valid JSON");

    return {
      ok: false,
      error,
      response: errorResponse(error),
    };
  }
}

export async function parseJsonBody(request, options = {}) {
  const result = await readJsonBody(request, options);

  if (!result.ok) {
    throw result.error;
  }

  return result.data;
}

export function createApiHandler(handlers) {
  const allowedMethods = normalizeMethods(Object.keys(handlers));

  return async function onRequest(context) {
    const method = context.request.method.toUpperCase();
    const handler = handlers[method];

    if (!handler) {
      return errorResponse(methodNotAllowedError(allowedMethods));
    }

    try {
      return await handler(context);
    } catch (error) {
      return errorResponse(error, context);
    }
  };
}

