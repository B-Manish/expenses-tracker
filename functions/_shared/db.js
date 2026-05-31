import { errorResponse, internalServerError } from "./errors.js";

function isD1Database(value) {
  return Boolean(value && typeof value.prepare === "function");
}

export function getDb(context) {
  const db = context?.env?.DB;

  if (!isD1Database(db)) {
    const error = internalServerError("Database binding is not configured", {
      expose: true,
      publicMessage: "Database binding is not configured",
    });

    return {
      ok: false,
      error,
      response: errorResponse(error, context),
    };
  }

  return {
    ok: true,
    db,
  };
}

export function requireDb(context) {
  const result = getDb(context);

  if (!result.ok) {
    throw result.error;
  }

  return result.db;
}

export async function withDb(context, operation) {
  const db = requireDb(context);

  try {
    return await operation(db);
  } catch {
    throw internalServerError("Database operation failed");
  }
}

