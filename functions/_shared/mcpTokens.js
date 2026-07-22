import { z } from "zod";
import { notFound } from "./errors.js";
import { idSchema, validate } from "./validation.js";

const TOKEN_PREFIX = "cashly_mcp_";
const TOKEN_BYTES = 32;
const MAX_LABEL_LENGTH = 80;
const encoder = new TextEncoder();

const labelSchema = z
  .preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .trim()
      .max(MAX_LABEL_LENGTH, `Label must be ${MAX_LABEL_LENGTH} characters or less`)
      .optional(),
  )
  .transform((value) => value ?? null);

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashMcpToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export async function generateMcpToken() {
  const random = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  const token = `${TOKEN_PREFIX}${bytesToBase64Url(random)}`;
  return { token, tokenHash: await hashMcpToken(token) };
}

export function validateMcpTokenLabel(input) {
  return validate(labelSchema, input);
}

export function validateMcpTokenId(input) {
  return validate(idSchema, input);
}

function mapTokenRow(row) {
  return {
    id: row.id,
    label: row.label ?? null,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? null,
  };
}

export async function listMcpTokens(db, userId) {
  const rows = await db
    .prepare(`
      SELECT id, label, created_at, last_used_at
      FROM mcp_tokens
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
    `)
    .bind(userId)
    .all();

  return { items: (rows.results || []).map(mapTokenRow) };
}

export async function createMcpToken(db, userId, label) {
  const { token, tokenHash } = await generateMcpToken();
  const result = await db
    .prepare("INSERT INTO mcp_tokens (user_id, token_hash, label) VALUES (?, ?, ?)")
    .bind(userId, tokenHash, label)
    .run();

  const id = result.meta?.last_row_id;
  const row = await db
    .prepare("SELECT id, label, created_at, last_used_at FROM mcp_tokens WHERE id = ?")
    .bind(id)
    .first();

  return { ...mapTokenRow(row), token };
}

export async function revokeMcpToken(db, userId, id) {
  const result = await db
    .prepare("DELETE FROM mcp_tokens WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .run();

  if (!result.meta?.changes) {
    throw notFound("Token not found");
  }

  return { deleted: true };
}

export async function resolveMcpToken(db, token) {
  if (typeof token !== "string" || !token) {
    return null;
  }

  const tokenHash = await hashMcpToken(token);
  const row = await db
    .prepare("SELECT id, user_id FROM mcp_tokens WHERE token_hash = ?")
    .bind(tokenHash)
    .first();

  if (!row) {
    return null;
  }

  // ponytail: best-effort last-used stamp on every resolve; a write failure here
  // must never block the MCP request. Throttle only if write volume matters.
  try {
    await db
      .prepare("UPDATE mcp_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(row.id)
      .run();
  } catch {
    // ignore
  }

  return { userId: row.user_id, tokenId: row.id };
}
