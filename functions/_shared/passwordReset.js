import { getClientKey } from "./security.js";

export const DEFAULT_RESET_EMAIL_TO = "batchumanish@gmail.com";

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;
const RESET_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const RESET_REQUEST_MAX_ATTEMPTS = 5;
const RESET_VERIFY_WINDOW_MS = 10 * 60 * 1000;
const RESET_VERIFY_MAX_FAILURES = 10;
const encoder = new TextEncoder();

const resetRequestAttempts =
  globalThis.__expensesTrackerPasswordResetRequests ??
  new Map();
const resetVerifyFailures =
  globalThis.__expensesTrackerPasswordResetVerifyFailures ??
  new Map();

globalThis.__expensesTrackerPasswordResetRequests = resetRequestAttempts;
globalThis.__expensesTrackerPasswordResetVerifyFailures = resetVerifyFailures;

function getSessionSecret(env) {
  return typeof env?.SESSION_SECRET === "string" && env.SESSION_SECRET
    ? env.SESSION_SECRET
    : null;
}

function toHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return toHex(new Uint8Array(signature));
}

async function hashResetCode(env, email, code) {
  const secret = getSessionSecret(env);

  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }

  return hmacSha256(`${email}:${code}`, secret);
}

function retryAfterSeconds(milliseconds) {
  return Math.max(1, Math.ceil(milliseconds / 1000));
}

function isWindowFresh(entry, now, windowMs) {
  return entry && now - entry.windowStart < windowMs;
}

export function getPasswordResetRecipient(env) {
  const configured = typeof env?.RESET_EMAIL_TO === "string"
    ? env.RESET_EMAIL_TO.trim()
    : "";

  return configured || DEFAULT_RESET_EMAIL_TO;
}

export function maskEmail(email) {
  const [localPart, domain] = email.split("@");

  if (!localPart || !domain) {
    return "your email";
  }

  const visible = localPart.slice(0, 2);

  return `${visible}${"*".repeat(Math.max(localPart.length - visible.length, 3))}@${domain}`;
}

export function getPasswordResetEmailConfigStatus(env) {
  if (
    !env?.RESEND_API_KEY ||
    typeof env.RESEND_API_KEY !== "string" ||
    !env.RESEND_API_KEY.trim()
  ) {
    return {
      configured: false,
      message: "Password reset email is not configured.",
    };
  }

  if (
    !env?.RESET_EMAIL_FROM ||
    typeof env.RESET_EMAIL_FROM !== "string" ||
    !env.RESET_EMAIL_FROM.trim()
  ) {
    return {
      configured: false,
      message: "Password reset sender is not configured.",
    };
  }

  return { configured: true };
}

export function createResetCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);

  return String(values[0] % 10 ** CODE_LENGTH).padStart(CODE_LENGTH, "0");
}

export function normalizeResetCode(value) {
  if (typeof value !== "string") {
    return null;
  }

  const code = value.replace(/\s+/g, "");

  return /^\d{6}$/.test(code) ? code : null;
}

export function recordPasswordResetRequest(request, now = Date.now()) {
  const key = getClientKey(request);
  const current = resetRequestAttempts.get(key);

  if (current?.blockedUntil && current.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: retryAfterSeconds(current.blockedUntil - now),
    };
  }

  if (current?.lastAttemptAt && now - current.lastAttemptAt < RESET_REQUEST_COOLDOWN_MS) {
    return {
      blocked: true,
      retryAfterSeconds: retryAfterSeconds(RESET_REQUEST_COOLDOWN_MS - (now - current.lastAttemptAt)),
    };
  }

  const windowStart = isWindowFresh(current, now, RESET_REQUEST_WINDOW_MS)
    ? current.windowStart
    : now;
  const attempts = isWindowFresh(current, now, RESET_REQUEST_WINDOW_MS)
    ? current.attempts + 1
    : 1;
  const blockedUntil = attempts > RESET_REQUEST_MAX_ATTEMPTS
    ? windowStart + RESET_REQUEST_WINDOW_MS
    : 0;

  resetRequestAttempts.set(key, {
    attempts,
    blockedUntil,
    lastAttemptAt: now,
    windowStart,
  });

  if (blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: retryAfterSeconds(blockedUntil - now),
    };
  }

  return { blocked: false };
}

export function getPasswordResetVerifyThrottleStatus(request, now = Date.now()) {
  const key = getClientKey(request);
  const current = resetVerifyFailures.get(key);

  if (!current || now - current.windowStart >= RESET_VERIFY_WINDOW_MS) {
    resetVerifyFailures.delete(key);
    return { blocked: false };
  }

  if (current.failures >= RESET_VERIFY_MAX_FAILURES) {
    return {
      blocked: true,
      retryAfterSeconds: retryAfterSeconds(RESET_VERIFY_WINDOW_MS - (now - current.windowStart)),
    };
  }

  return { blocked: false };
}

export function recordPasswordResetVerifyFailure(request, now = Date.now()) {
  const key = getClientKey(request);
  const current = resetVerifyFailures.get(key);
  const windowStart = isWindowFresh(current, now, RESET_VERIFY_WINDOW_MS)
    ? current.windowStart
    : now;
  const failures = isWindowFresh(current, now, RESET_VERIFY_WINDOW_MS)
    ? current.failures + 1
    : 1;

  resetVerifyFailures.set(key, { failures, windowStart });

  if (failures >= RESET_VERIFY_MAX_FAILURES) {
    return {
      blocked: true,
      retryAfterSeconds: retryAfterSeconds(RESET_VERIFY_WINDOW_MS - (now - windowStart)),
    };
  }

  return { blocked: false };
}

export function clearPasswordResetVerifyFailures(request) {
  resetVerifyFailures.delete(getClientKey(request));
}

export async function storePasswordResetCode(env, email, code, now = new Date()) {
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  const codeHash = await hashResetCode(env, email, code);

  await env.DB.prepare(
    `DELETE FROM password_reset_codes
     WHERE email = ? AND (expires_at <= ? OR consumed_at IS NOT NULL)`,
  )
    .bind(email, nowIso)
    .run();

  await env.DB.prepare(
    `UPDATE password_reset_codes
     SET consumed_at = ?
     WHERE email = ? AND consumed_at IS NULL`,
  )
    .bind(nowIso, email)
    .run();

  await env.DB.prepare(
    `INSERT INTO password_reset_codes (email, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(email, codeHash, expiresAt.toISOString(), nowIso)
    .run();

  return {
    codeHash,
    expiresAt,
    expiresInMinutes: CODE_TTL_MINUTES,
  };
}

export async function deletePasswordResetCode(env, email, codeHash) {
  await env.DB.prepare(
    `DELETE FROM password_reset_codes
     WHERE email = ? AND code_hash = ?`,
  )
    .bind(email, codeHash)
    .run();
}

export async function consumePasswordResetCode(env, email, code, now = new Date()) {
  const codeHash = await hashResetCode(env, email, code);
  const nowIso = now.toISOString();
  const record = await env.DB.prepare(
    `SELECT id, expires_at, consumed_at
     FROM password_reset_codes
     WHERE email = ? AND code_hash = ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(email, codeHash)
    .first();

  if (!record || record.consumed_at || record.expires_at <= nowIso) {
    return {
      ok: false,
      message: "Invalid or expired verification code.",
      status: 401,
    };
  }

  await env.DB.prepare(
    `UPDATE password_reset_codes
     SET consumed_at = ?
     WHERE id = ? AND consumed_at IS NULL`,
  )
    .bind(nowIso, record.id)
    .run();

  return { ok: true };
}

export async function sendPasswordResetCode(env, email, code) {
  const configStatus = getPasswordResetEmailConfigStatus(env);

  if (!configStatus.configured) {
    return {
      ok: false,
      message: configStatus.message,
      status: 500,
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESET_EMAIL_FROM.trim(),
      to: [email],
      subject: "Expense Tracker verification code",
      text: [
        `Your Expense Tracker verification code is ${code}.`,
        `It expires in ${CODE_TTL_MINUTES} minutes.`,
        "If you did not request this, you can ignore this email.",
      ].join("\n\n"),
      html: [
        "<p>Your Expense Tracker verification code is:</p>",
        `<p style="font-size: 28px; font-weight: 700; letter-spacing: 0.18em;">${code}</p>`,
        `<p>It expires in ${CODE_TTL_MINUTES} minutes.</p>`,
        "<p>If you did not request this, you can ignore this email.</p>",
      ].join(""),
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      message: "Could not send verification code.",
      status: 502,
    };
  }

  return { ok: true };
}
