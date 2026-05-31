import { z } from "zod";
import { badRequest, conflict, notFound } from "./errors.js";
import { idSchema, stringSchema, validate } from "./validation.js";

const MAX_PAYMENT_METHOD_NAME_LENGTH = 80;

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizePaymentMethodPayload(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return {
    name: value.name,
  };
}

const paymentMethodPayloadSchema = z.preprocess(
  normalizePaymentMethodPayload,
  z.object({
    name: stringSchema("Name", { max: MAX_PAYMENT_METHOD_NAME_LENGTH }),
  }),
);

function mapPaymentMethodRow(row) {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findPaymentMethodByDuplicateName(db, name, ignoredId = null) {
  if (ignoredId === null) {
    return db
      .prepare("SELECT id FROM payment_methods WHERE LOWER(name) = LOWER(?) LIMIT 1")
      .bind(name)
      .first();
  }

  return db
    .prepare(`
      SELECT id
      FROM payment_methods
      WHERE LOWER(name) = LOWER(?)
      AND id <> ?
      LIMIT 1
    `)
    .bind(name, ignoredId)
    .first();
}

async function assertUniquePaymentMethodName(db, name, ignoredId = null) {
  const duplicate = await findPaymentMethodByDuplicateName(db, name, ignoredId);

  if (duplicate) {
    throw conflict("Payment method name already exists");
  }
}

async function getPaymentMethodUsageCount(db, id) {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM transactions WHERE payment_method_id = ?")
    .bind(id)
    .first();

  return row?.count ?? 0;
}

function assertDefaultPaymentMethodCanBeUpdated(existing, paymentMethod) {
  if (!existing.isDefault) {
    return;
  }

  if (existing.name !== paymentMethod.name) {
    throw conflict("Default payment method name cannot be changed");
  }
}

export function validatePaymentMethodPayload(input) {
  return validate(paymentMethodPayloadSchema, input);
}

export function validatePaymentMethodId(input) {
  return validate(idSchema, input);
}

export async function listPaymentMethods(db) {
  const rows = await db
    .prepare(`
      SELECT id, name, is_default, created_at, updated_at
      FROM payment_methods
      ORDER BY is_default DESC, LOWER(name) ASC, id ASC
    `)
    .all();

  return {
    items: (rows.results || []).map(mapPaymentMethodRow),
  };
}

export async function getPaymentMethodById(db, id) {
  const row = await db
    .prepare(`
      SELECT id, name, is_default, created_at, updated_at
      FROM payment_methods
      WHERE id = ?
    `)
    .bind(id)
    .first();

  return row ? mapPaymentMethodRow(row) : null;
}

export async function createPaymentMethod(db, paymentMethod) {
  await assertUniquePaymentMethodName(db, paymentMethod.name);

  const result = await db
    .prepare(`
      INSERT INTO payment_methods (name, is_default)
      VALUES (?, 0)
    `)
    .bind(paymentMethod.name)
    .run();

  const id = result.meta?.last_row_id;

  if (!id) {
    throw badRequest("Payment method could not be created");
  }

  return getPaymentMethodById(db, id);
}

export async function updatePaymentMethod(db, id, paymentMethod) {
  const existing = await getPaymentMethodById(db, id);

  if (!existing) {
    throw notFound("Payment method not found");
  }

  assertDefaultPaymentMethodCanBeUpdated(existing, paymentMethod);
  await assertUniquePaymentMethodName(db, paymentMethod.name, id);
  await db
    .prepare(`
      UPDATE payment_methods
      SET
        name = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(paymentMethod.name, id)
    .run();

  return getPaymentMethodById(db, id);
}

export async function deletePaymentMethod(db, id) {
  const existing = await getPaymentMethodById(db, id);

  if (!existing) {
    throw notFound("Payment method not found");
  }

  if (existing.isDefault) {
    throw conflict("Default payment methods cannot be deleted");
  }

  const usageCount = await getPaymentMethodUsageCount(db, id);

  if (usageCount > 0) {
    throw conflict("Payment method is used by transactions");
  }

  await db.prepare("DELETE FROM payment_methods WHERE id = ?").bind(id).run();

  return {
    deleted: true,
  };
}
