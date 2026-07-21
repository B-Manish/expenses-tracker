import { deleteEntry, getClientKey, readEntry, writeEntry } from "./rateLimit.js";

const RESET_REQUEST_SCOPE = "reset-request";
const RESET_VERIFY_SCOPE = "reset-verify";

const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;
const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;
const RESET_TOKEN_TTL_MINUTES = 15;
const RESET_TOKEN_TTL_MS = RESET_TOKEN_TTL_MINUTES * 60 * 1000;
const RESET_TOKEN_BYTES = 32;
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;
const RESET_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const RESET_REQUEST_MAX_ATTEMPTS = 5;
const RESET_VERIFY_WINDOW_MS = 10 * 60 * 1000;
const RESET_VERIFY_MAX_FAILURES = 10;
const encoder = new TextEncoder();

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

function base64UrlEncodeBytes(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
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

async function hashResetToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));

  return toHex(new Uint8Array(digest));
}

function retryAfterSeconds(milliseconds) {
  return Math.max(1, Math.ceil(milliseconds / 1000));
}

function isWindowFresh(entry, now, windowMs) {
  return entry && now - entry.windowStart < windowMs;
}

export function isPasswordResetConfigured(env) {
  return Boolean(
    env?.SESSION_SECRET &&
      typeof env.SESSION_SECRET === "string",
  );
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

export async function recordPasswordResetRequest(db, request, now = Date.now()) {
  const key = getClientKey(request);
  const current = await readEntry(db, RESET_REQUEST_SCOPE, key);

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

  await writeEntry(db, RESET_REQUEST_SCOPE, key, {
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

export async function getPasswordResetVerifyThrottleStatus(db, request, now = Date.now()) {
  const key = getClientKey(request);
  const current = await readEntry(db, RESET_VERIFY_SCOPE, key);

  if (!current || now - current.windowStart >= RESET_VERIFY_WINDOW_MS) {
    await deleteEntry(db, RESET_VERIFY_SCOPE, key);
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

export async function recordPasswordResetVerifyFailure(db, request, now = Date.now()) {
  const key = getClientKey(request);
  const current = await readEntry(db, RESET_VERIFY_SCOPE, key);
  const windowStart = isWindowFresh(current, now, RESET_VERIFY_WINDOW_MS)
    ? current.windowStart
    : now;
  const failures = isWindowFresh(current, now, RESET_VERIFY_WINDOW_MS)
    ? current.failures + 1
    : 1;

  await writeEntry(db, RESET_VERIFY_SCOPE, key, { failures, windowStart });

  if (failures >= RESET_VERIFY_MAX_FAILURES) {
    return {
      blocked: true,
      retryAfterSeconds: retryAfterSeconds(RESET_VERIFY_WINDOW_MS - (now - windowStart)),
    };
  }

  return { blocked: false };
}

export async function clearPasswordResetVerifyFailures(db, request) {
  await deleteEntry(db, RESET_VERIFY_SCOPE, getClientKey(request));
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

export async function createResetPasswordToken(env, email, now = new Date()) {
  if (!env?.DB) {
    throw new Error("Password reset storage is not configured");
  }

  const token = base64UrlEncodeBytes(
    crypto.getRandomValues(new Uint8Array(RESET_TOKEN_BYTES)),
  );
  const tokenHash = await hashResetToken(token);
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS).toISOString();

  await env.DB.prepare(`
    DELETE FROM password_reset_tokens
    WHERE expires_at <= ? OR consumed_at IS NOT NULL
  `)
    .bind(nowIso)
    .run();

  await env.DB.prepare(`
    INSERT INTO password_reset_tokens (email, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `)
    .bind(email, tokenHash, expiresAt, nowIso)
    .run();

  return {
    token,
    expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
  };
}

export async function consumeResetPasswordToken(env, token, now = new Date()) {
  if (!env?.DB) {
    return {
      ok: false,
      message: "Password reset storage is not configured",
      status: 500,
    };
  }

  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return {
      ok: false,
      message: "Reset session is invalid or expired",
      status: 401,
    };
  }

  const nowIso = now.toISOString();
  const tokenHash = await hashResetToken(token);
  const record = await env.DB.prepare(`
    UPDATE password_reset_tokens
    SET consumed_at = ?
    WHERE token_hash = ?
      AND consumed_at IS NULL
      AND expires_at > ?
    RETURNING email
  `)
    .bind(nowIso, tokenHash, nowIso)
    .first();

  if (!record?.email) {
    return {
      ok: false,
      message: "Reset session is invalid or expired",
      status: 401,
    };
  }

  return {
    ok: true,
    email: record.email,
  };
}

export async function sendPasswordResetCode(env, email, code) {
  if (env?.EMAIL_DEV_SHOW_CODES === "true") {
    return {
      ok: true,
      devCode: code,
    };
  }

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
      subject: "Cashly verification code",
      text: [
        `Your Cashly verification code is ${code}.`,
        `It expires in ${CODE_TTL_MINUTES} minutes.`,
        "If you did not request this, you can ignore this email.",
      ].join("\n\n"),
      html: [
        "<p>Your Cashly verification code is:</p>",
        `<p style="font-size: 28px; font-weight: 700;">${code}</p>`,
        `<p>It expires in ${CODE_TTL_MINUTES} minutes.</p>`,
        "<p>If you did not request this, you can ignore this email.</p>",
      ].join(""),
    }),
  });

  if (!response.ok) {
    let providerMessage = "Could not send verification code.";

    try {
      const contentType = response.headers.get("content-type") || "";

      if (contentType.toLowerCase().includes("application/json")) {
        const payload = await response.json();
        const message = payload?.message || payload?.error?.message || payload?.error;

        if (typeof message === "string" && message.trim()) {
          providerMessage = message.trim();
        }
      } else {
        const text = await response.text();

        if (text.trim()) {
          providerMessage = text.trim();
        }
      }
    } catch {
      // Keep the fallback message when the provider response cannot be parsed.
    }

    return {
      ok: false,
      message: providerMessage,
      status: 502,
    };
  }

  return { ok: true };
}
