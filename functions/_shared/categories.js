import { z } from "zod";
import { badRequest, conflict, notFound } from "./errors.js";
import { enumSchema, idSchema, stringSchema, validate } from "./validation.js";

const CATEGORY_TYPES = ["EXPENSE", "INCOME"];
const MAX_CATEGORY_NAME_LENGTH = 80;
const MAX_ICON_LENGTH = 64;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const ICON_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function emptyToNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
}

function emptyToUndefined(value) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}

function normalizeCategoryPayload(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return {
    name: value.name,
    type: value.type,
    color: value.color,
    icon: value.icon,
  };
}

function normalizeCategoryQuery(input) {
  const value = input instanceof URLSearchParams
    ? Object.fromEntries(input.entries())
    : input;

  if (!isPlainObject(value)) {
    return {};
  }

  return {
    type: value.type,
  };
}

const optionalColorSchema = z
  .preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .regex(HEX_COLOR_PATTERN, "Color must be a hex value like #ef4444")
      .nullable()
      .optional(),
  )
  .transform((value) => value ?? null);

const optionalIconSchema = z
  .preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(MAX_ICON_LENGTH, `Icon must be ${MAX_ICON_LENGTH} characters or less`)
      .regex(
        ICON_PATTERN,
        "Icon must contain lowercase letters, numbers, and hyphens only",
      )
      .nullable()
      .optional(),
  )
  .transform((value) => value ?? null);

const categoryPayloadSchema = z.preprocess(
  normalizeCategoryPayload,
  z.object({
    name: stringSchema("Name", { max: MAX_CATEGORY_NAME_LENGTH }),
    type: enumSchema(CATEGORY_TYPES, "Type"),
    color: optionalColorSchema,
    icon: optionalIconSchema,
  }),
);

const categoryQuerySchema = z.preprocess(
  normalizeCategoryQuery,
  z.object({
    type: z.preprocess(
      emptyToUndefined,
      enumSchema(CATEGORY_TYPES, "Type").optional(),
    ),
  }),
);

function mapCategoryRow(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color,
    icon: row.icon,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findCategoryByDuplicateName(db, name, ignoredId = null) {
  if (ignoredId === null) {
    return db
      .prepare("SELECT id FROM categories WHERE LOWER(name) = LOWER(?) LIMIT 1")
      .bind(name)
      .first();
  }

  return db
    .prepare(`
      SELECT id
      FROM categories
      WHERE LOWER(name) = LOWER(?)
      AND id <> ?
      LIMIT 1
    `)
    .bind(name, ignoredId)
    .first();
}

async function assertUniqueCategoryName(db, name, ignoredId = null) {
  const duplicate = await findCategoryByDuplicateName(db, name, ignoredId);

  if (duplicate) {
    throw conflict("Category name already exists");
  }
}

async function getCategoryUsageCount(db, id) {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM transactions WHERE category_id = ?")
    .bind(id)
    .first();

  return row?.count ?? 0;
}

function assertDefaultCategoryCanBeUpdated(existing, category) {
  if (!existing.isDefault) {
    return;
  }

  if (existing.name !== category.name || existing.type !== category.type) {
    throw conflict("Default category name and type cannot be changed");
  }
}

export function validateCategoryPayload(input) {
  return validate(categoryPayloadSchema, input);
}

export function validateCategoryQuery(input) {
  return validate(categoryQuerySchema, input);
}

export function validateCategoryId(input) {
  return validate(idSchema, input);
}

export async function listCategories(db, query = {}) {
  if (query.type) {
    const rows = await db
      .prepare(`
        SELECT id, name, type, color, icon, is_default, created_at, updated_at
        FROM categories
        WHERE type = ?
        ORDER BY is_default DESC, LOWER(name) ASC, id ASC
      `)
      .bind(query.type)
      .all();

    return {
      items: (rows.results || []).map(mapCategoryRow),
    };
  }

  const rows = await db
    .prepare(`
      SELECT id, name, type, color, icon, is_default, created_at, updated_at
      FROM categories
      ORDER BY type ASC, is_default DESC, LOWER(name) ASC, id ASC
    `)
    .all();

  return {
    items: (rows.results || []).map(mapCategoryRow),
  };
}

export async function getCategoryById(db, id) {
  const row = await db
    .prepare(`
      SELECT id, name, type, color, icon, is_default, created_at, updated_at
      FROM categories
      WHERE id = ?
    `)
    .bind(id)
    .first();

  return row ? mapCategoryRow(row) : null;
}

export async function createCategory(db, category) {
  await assertUniqueCategoryName(db, category.name);

  const result = await db
    .prepare(`
      INSERT INTO categories (name, type, color, icon, is_default)
      VALUES (?, ?, ?, ?, 0)
    `)
    .bind(category.name, category.type, category.color, category.icon)
    .run();

  const id = result.meta?.last_row_id;

  if (!id) {
    throw badRequest("Category could not be created");
  }

  return getCategoryById(db, id);
}

export async function updateCategory(db, id, category) {
  const existing = await getCategoryById(db, id);

  if (!existing) {
    throw notFound("Category not found");
  }

  assertDefaultCategoryCanBeUpdated(existing, category);
  if (existing.type !== category.type) {
    const usageCount = await getCategoryUsageCount(db, id);

    if (usageCount > 0) {
      throw conflict("Category type cannot be changed while used by transactions");
    }
  }

  await assertUniqueCategoryName(db, category.name, id);
  await db
    .prepare(`
      UPDATE categories
      SET
        name = ?,
        type = ?,
        color = ?,
        icon = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(category.name, category.type, category.color, category.icon, id)
    .run();

  return getCategoryById(db, id);
}

export async function deleteCategory(db, id) {
  const existing = await getCategoryById(db, id);

  if (!existing) {
    throw notFound("Category not found");
  }

  if (existing.isDefault) {
    throw conflict("Default categories cannot be deleted");
  }

  const usageCount = await getCategoryUsageCount(db, id);

  if (usageCount > 0) {
    throw conflict("Category is used by transactions");
  }

  await db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();

  return {
    deleted: true,
  };
}
