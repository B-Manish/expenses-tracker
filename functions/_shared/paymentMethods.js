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

async function findPaymentMethodByDuplicateName(db, userId, name, ignoredId = null) {
  if (ignoredId === null) {
    return db
      .prepare("SELECT id FROM payment_methods WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1")
      .bind(userId, name)
      .first();
  }

  return db
    .prepare(`
      SELECT id
      FROM payment_methods
      WHERE user_id = ?
      AND LOWER(name) = LOWER(?)
      AND id <> ?
      LIMIT 1
    `)
    .bind(userId, name, ignoredId)
    .first();
}

async function assertUniquePaymentMethodName(db, userId, name, ignoredId = null) {
  const duplicate = await findPaymentMethodByDuplicateName(db, userId, name, ignoredId);

  if (duplicate) {
    throw conflict("Payment method name already exists");
  }
}

async function getPaymentMethodUsageCount(db, userId, id) {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM transactions WHERE user_id = ? AND payment_method_id = ?")
    .bind(userId, id)
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

export async function listPaymentMethods(db, userId) {
  const rows = await db
    .prepare(`
      SELECT id, name, is_default, created_at, updated_at
      FROM payment_methods
      WHERE user_id = ?
      ORDER BY is_default DESC, LOWER(name) ASC, id ASC
    `)
    .bind(userId)
    .all();

  return {
    items: (rows.results || []).map(mapPaymentMethodRow),
  };
}

export async function getPaymentMethodById(db, userId, id) {
  const row = await db
    .prepare(`
      SELECT id, name, is_default, created_at, updated_at
      FROM payment_methods
      WHERE user_id = ?
        AND id = ?
    `)
    .bind(userId, id)
    .first();

  return row ? mapPaymentMethodRow(row) : null;
}

export async function createPaymentMethod(db, userId, paymentMethod) {
  await assertUniquePaymentMethodName(db, userId, paymentMethod.name);

  const result = await db
    .prepare(`
      INSERT INTO payment_methods (user_id, name, is_default)
      VALUES (?, ?, 0)
    `)
    .bind(userId, paymentMethod.name)
    .run();

  const id = result.meta?.last_row_id;

  if (!id) {
    throw badRequest("Payment method could not be created");
  }

  return getPaymentMethodById(db, userId, id);
}

export async function updatePaymentMethod(db, userId, id, paymentMethod) {
  const existing = await getPaymentMethodById(db, userId, id);

  if (!existing) {
    throw notFound("Payment method not found");
  }

  assertDefaultPaymentMethodCanBeUpdated(existing, paymentMethod);
  await assertUniquePaymentMethodName(db, userId, paymentMethod.name, id);
  await db
    .prepare(`
      UPDATE payment_methods
      SET
        name = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND id = ?
    `)
    .bind(paymentMethod.name, userId, id)
    .run();

  return getPaymentMethodById(db, userId, id);
}

export async function deletePaymentMethod(db, userId, id) {
  const existing = await getPaymentMethodById(db, userId, id);

  if (!existing) {
    throw notFound("Payment method not found");
  }

  if (existing.isDefault) {
    throw conflict("Default payment methods cannot be deleted");
  }

  const usageCount = await getPaymentMethodUsageCount(db, userId, id);

  if (usageCount > 0) {
    throw conflict("Payment method is used by transactions");
  }

  await db.prepare("DELETE FROM payment_methods WHERE user_id = ? AND id = ?").bind(userId, id).run();

  return {
    deleted: true,
  };
}
