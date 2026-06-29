import { z } from "zod";
import { badRequest, conflict, errorResponse, notFound } from "./errors.js";
import { serializeSavedViewFilters } from "./transactions.js";
import { idSchema, stringSchema, validate } from "./validation.js";

const MAX_NAME_LENGTH = 80;

const SELECT_SAVED_VIEW_SQL = `
  SELECT id, user_id, name, filters, is_default, created_at, updated_at
  FROM saved_transaction_views
`;

const nameSchema = z.preprocess(
  (value) => (typeof value === "string" ? value : value ?? undefined),
  stringSchema("Name", { max: MAX_NAME_LENGTH }),
);

const isDefaultSchema = z.preprocess(
  (value) => (value === undefined || value === null ? false : value),
  z
    .union([z.boolean(), z.string()])
    .transform((value) => value === true || value === "true" || value === "1"),
);

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function fail(message) {
  const error = badRequest(message);

  return { ok: false, error, response: errorResponse(error) };
}

// Shared validation for create (full) and patch (partial). On patch, only the
// provided fields are validated and returned.
export function validateSavedViewPayload(input, { partial = false } = {}) {
  if (!isPlainObject(input)) {
    return fail("Request body must be an object");
  }

  const data = {};

  if (!partial || input.name !== undefined) {
    const result = validate(nameSchema, input.name);

    if (!result.ok) {
      return result;
    }

    data.name = result.data;
  }

  if (!partial || input.filters !== undefined) {
    const result = serializeSavedViewFilters(input.filters ?? {});

    if (!result.ok) {
      return result;
    }

    data.filters = result.data;
  }

  if (!partial || input.isDefault !== undefined) {
    const result = validate(isDefaultSchema, input.isDefault);

    if (!result.ok) {
      return result;
    }

    data.isDefault = result.data;
  }

  if (partial && Object.keys(data).length === 0) {
    return fail("Provide at least one field to update");
  }

  return { ok: true, data };
}

export function validateSavedViewId(input) {
  return validate(idSchema, input);
}

function parseStoredFilters(value) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function mapSavedViewRow(row) {
  return {
    id: row.id,
    name: row.name,
    filters: parseStoredFilters(row.filters),
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertUniqueName(db, userId, name, ignoredId = null) {
  const duplicate = await db
    .prepare(`
      SELECT id
      FROM saved_transaction_views
      WHERE user_id = ?
        AND LOWER(name) = LOWER(?)
        AND (? IS NULL OR id <> ?)
      LIMIT 1
    `)
    .bind(userId, name, ignoredId, ignoredId)
    .first();

  if (duplicate) {
    throw conflict("A view with this name already exists");
  }
}

// Clears the existing default so at most one view per user is the default.
async function clearDefault(db, userId, exceptId = null) {
  await db
    .prepare(`
      UPDATE saved_transaction_views
      SET is_default = 0, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND is_default = 1
        AND (? IS NULL OR id <> ?)
    `)
    .bind(userId, exceptId, exceptId)
    .run();
}

export async function listSavedViews(db, userId) {
  const rows = await db
    .prepare(`
      ${SELECT_SAVED_VIEW_SQL}
      WHERE user_id = ?
      ORDER BY is_default DESC, LOWER(name) ASC, id ASC
    `)
    .bind(userId)
    .all();

  return {
    items: (rows.results || []).map(mapSavedViewRow),
  };
}

export async function getSavedViewById(db, userId, id) {
  const row = await db
    .prepare(`${SELECT_SAVED_VIEW_SQL} WHERE user_id = ? AND id = ?`)
    .bind(userId, id)
    .first();

  return row ? mapSavedViewRow(row) : null;
}

export async function createSavedView(db, userId, payload) {
  await assertUniqueName(db, userId, payload.name);

  if (payload.isDefault) {
    await clearDefault(db, userId);
  }

  const result = await db
    .prepare(`
      INSERT INTO saved_transaction_views (user_id, name, filters, is_default)
      VALUES (?, ?, ?, ?)
    `)
    .bind(userId, payload.name, JSON.stringify(payload.filters ?? {}), payload.isDefault ? 1 : 0)
    .run();

  const id = result.meta?.last_row_id;

  if (!id) {
    throw badRequest("Saved view could not be created");
  }

  return getSavedViewById(db, userId, id);
}

export async function updateSavedView(db, userId, id, payload) {
  const existing = await getSavedViewById(db, userId, id);

  if (!existing) {
    throw notFound("Saved view not found");
  }

  const name = payload.name ?? existing.name;
  const filters = payload.filters ?? existing.filters;
  const isDefault = payload.isDefault ?? existing.isDefault;

  if (payload.name !== undefined) {
    await assertUniqueName(db, userId, name, id);
  }

  if (isDefault) {
    await clearDefault(db, userId, id);
  }

  await db
    .prepare(`
      UPDATE saved_transaction_views
      SET name = ?, filters = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND id = ?
    `)
    .bind(name, JSON.stringify(filters ?? {}), isDefault ? 1 : 0, userId, id)
    .run();

  return getSavedViewById(db, userId, id);
}

export async function deleteSavedView(db, userId, id) {
  const existing = await getSavedViewById(db, userId, id);

  if (!existing) {
    throw notFound("Saved view not found");
  }

  await db
    .prepare("DELETE FROM saved_transaction_views WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .run();

  return { deleted: true };
}
