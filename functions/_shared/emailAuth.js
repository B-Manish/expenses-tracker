import { z } from "zod";
import { conflict, internalServerError, isDevelopmentEnv, unauthorized } from "./errors.js";
import { parseValidated } from "./validation.js";

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const SIGNUP_PURPOSE = "SIGNUP";
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const PBKDF2_ITERATIONS = 210000;
const encoder = new TextEncoder();

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

const signupRequestSchema = emailSchema.extend({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters.").max(120),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

const codeSchema = emailSchema.extend({
  code: z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit verification code."),
});

const passwordLoginSchema = emailSchema.extend({
  password: z.string().min(1, "Password is required.").max(200, "Password must be 200 characters or less."),
});

export function parseSignupRequestPayload(input) {
  return parseValidated(signupRequestSchema, input);
}

export function parseSignupVerifyPayload(input) {
  return parseValidated(codeSchema, input);
}

export function parsePasswordLoginPayload(input) {
  return parseValidated(passwordLoginSchema, input);
}

function createUserId(email) {
  return `email:${email}`;
}

function createCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);

  return String(values[0] % 10 ** CODE_LENGTH).padStart(CODE_LENGTH, "0");
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
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

  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getSessionSecret(env) {
  if (typeof env?.SESSION_SECRET !== "string" || !env.SESSION_SECRET) {
    throw internalServerError("Authentication is not configured", {
      expose: true,
      publicMessage: "Authentication is not configured",
    });
  }

  return env.SESSION_SECRET;
}

async function hashCode(env, email, purpose, code) {
  return hmacSha256(`${purpose}:${email}:${code}`, getSessionSecret(env));
}

function bytesToBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBytes(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function constantTimeEqual(first, second) {
  if (first.length !== second.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < first.length; index += 1) {
    difference |= first[index] ^ second[index];
  }

  return difference === 0;
}

async function hmacSha256Bytes(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return new Uint8Array(signature);
}

// PBKDF2 makes offline cracking of a leaked hash slow; the SESSION_SECRET
// pepper is folded into the input as a second, secret-only defense layer.
async function pbkdf2Bytes(password, salt, iterations, pepper) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${pepper}:${password}`),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", iterations, salt },
    key,
    HASH_BYTES * 8,
  );

  return new Uint8Array(bits);
}

async function hashUserPassword(env, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const saltText = bytesToBase64Url(salt);
  const hash = await pbkdf2Bytes(
    password,
    salt,
    PBKDF2_ITERATIONS,
    getSessionSecret(env),
  );

  return JSON.stringify({
    algorithm: "pbkdf2-sha256-v1",
    iterations: PBKDF2_ITERATIONS,
    salt: saltText,
    hash: bytesToBase64Url(hash),
  });
}

// Returns { valid, needsRehash }. Legacy hmac-sha256-v1 hashes still verify so
// existing accounts are not locked out; callers upgrade them on next login.
async function verifyUserPassword(env, storedValue, password) {
  if (!storedValue) {
    return { valid: false, needsRehash: false };
  }

  let stored;

  try {
    stored = JSON.parse(storedValue);
  } catch {
    return { valid: false, needsRehash: false };
  }

  if (!stored?.salt || !stored.hash) {
    return { valid: false, needsRehash: false };
  }

  const expectedHash = base64UrlToBytes(stored.hash);

  if (stored.algorithm === "pbkdf2-sha256-v1") {
    const actualHash = await pbkdf2Bytes(
      password,
      base64UrlToBytes(stored.salt),
      Number(stored.iterations) || PBKDF2_ITERATIONS,
      getSessionSecret(env),
    );

    return { valid: constantTimeEqual(actualHash, expectedHash), needsRehash: false };
  }

  if (stored.algorithm === "hmac-sha256-v1") {
    const actualHash = await hmacSha256Bytes(`${stored.salt}:${password}`, getSessionSecret(env));

    return {
      valid: constantTimeEqual(actualHash, expectedHash),
      needsRehash: true,
    };
  }

  return { valid: false, needsRehash: false };
}

async function getUserByEmail(db, email) {
  return db
    .prepare("SELECT id, email, username, full_name, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first();
}

async function assertSignupAvailable(db, email) {
  if (await getUserByEmail(db, email)) {
    throw conflict("An account already exists for this email.");
  }
}

function getEmailConfigStatus(env) {
  if (
    !env?.RESEND_API_KEY ||
    typeof env.RESEND_API_KEY !== "string" ||
    !env.RESEND_API_KEY.trim()
  ) {
    return {
      configured: false,
      message: "Email delivery is not configured.",
    };
  }

  if (
    !env?.RESET_EMAIL_FROM ||
    typeof env.RESET_EMAIL_FROM !== "string" ||
    !env.RESET_EMAIL_FROM.trim()
  ) {
    return {
      configured: false,
      message: "Email sender is not configured.",
    };
  }

  return { configured: true };
}

async function sendVerificationCode(env, email, code) {
  if (env?.EMAIL_DEV_SHOW_CODES === "true" && isDevelopmentEnv(env)) {
    return {
      delivered: false,
      devCode: code,
    };
  }

  const configStatus = getEmailConfigStatus(env);

  if (!configStatus.configured) {
    throw internalServerError(configStatus.message, {
      expose: true,
      publicMessage: configStatus.message,
    });
  }

  let response;

  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        // Trim: a secret set with a trailing newline makes this an invalid
        // header value, which throws synchronously here and surfaces as an
        // opaque 500 instead of a delivery error.
        Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`,
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
  } catch (cause) {
    // Network failure or an invalid request (e.g. malformed key/header). Report
    // a delivery error the client can act on rather than a generic 500.
    throw internalServerError("Verification email could not be sent", {
      expose: true,
      publicMessage: "Verification email could not be sent",
      cause,
    });
  }

  if (!response.ok) {
    throw internalServerError("Verification email could not be sent", {
      expose: true,
      publicMessage: "Verification email could not be sent",
    });
  }

  return { delivered: true };
}

async function storeCode(db, env, email, purpose, code, pendingSignup = null) {
  await db
    .prepare(`
      UPDATE email_verification_codes
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE email = ?
        AND purpose = ?
        AND consumed_at IS NULL
    `)
    .bind(email, purpose)
    .run();

  await db
    .prepare(`
      INSERT INTO email_verification_codes (
        email,
        full_name,
        password_hash,
        purpose,
        code_hash,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      email,
      pendingSignup?.fullName ?? null,
      pendingSignup?.passwordHash ?? null,
      purpose,
      await hashCode(env, email, purpose, code),
      addMinutes(new Date(), CODE_TTL_MINUTES),
    )
    .run();
}

async function findValidCode(db, env, email, purpose, code) {
  return db
    .prepare(`
      SELECT id, full_name, password_hash
      FROM email_verification_codes
      WHERE email = ?
        AND purpose = ?
        AND code_hash = ?
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY id DESC
      LIMIT 1
    `)
    .bind(email, purpose, await hashCode(env, email, purpose, code))
    .first();
}

async function consumeCode(db, id) {
  await db
    .prepare(`
      UPDATE email_verification_codes
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(id)
    .run();
}

async function insertDefaultCategories(db, userId) {
  const categories = [
    ["Food", "EXPENSE", "#ef4444", "utensils"],
    ["Transport", "EXPENSE", "#3b82f6", "car"],
    ["Shopping", "EXPENSE", "#a855f7", "shopping-bag"],
    ["Fuel", "EXPENSE", "#f97316", "fuel"],
    ["Bills", "EXPENSE", "#eab308", "receipt"],
    ["Rent", "EXPENSE", "#14b8a6", "home"],
    ["Health", "EXPENSE", "#22c55e", "heart-pulse"],
    ["Entertainment", "EXPENSE", "#ec4899", "film"],
    ["Travel", "EXPENSE", "#06b6d4", "plane"],
    ["Education", "EXPENSE", "#6366f1", "book"],
    ["Other Expense", "EXPENSE", "#64748b", "circle"],
    ["Salary", "INCOME", "#10b981", "wallet"],
    ["Freelance", "INCOME", "#22c55e", "briefcase"],
    ["Refund", "INCOME", "#06b6d4", "rotate-ccw"],
    ["Interest", "INCOME", "#6366f1", "percent"],
    ["Other Income", "INCOME", "#64748b", "circle"],
  ];

  for (const [name, type, color, icon] of categories) {
    await db
      .prepare(`
        INSERT OR IGNORE INTO categories (user_id, name, type, color, icon, is_default)
        VALUES (?, ?, ?, ?, ?, 1)
      `)
      .bind(userId, name, type, color, icon)
      .run();
  }
}

async function insertDefaultPaymentMethods(db, userId) {
  for (const name of ["Cash", "UPI", "Debit Card", "Credit Card", "Net Banking", "Wallet", "Other"]) {
    await db
      .prepare(`
        INSERT OR IGNORE INTO payment_methods (user_id, name, is_default)
        VALUES (?, ?, 1)
      `)
      .bind(userId, name)
      .run();
  }
}

async function insertDefaultSettings(db, userId) {
  const settings = {
    currency: "INR",
    week_start_day: "MONDAY",
    theme: "system",
    timezone: "Asia/Kolkata",
  };

  for (const [key, value] of Object.entries(settings)) {
    await db
      .prepare(`
        INSERT OR IGNORE INTO settings (user_id, key, value)
        VALUES (?, ?, ?)
      `)
      .bind(userId, key, value)
      .run();
  }
}

async function seedUserDefaults(db, userId) {
  await insertDefaultCategories(db, userId);
  await insertDefaultPaymentMethods(db, userId);
  await insertDefaultSettings(db, userId);
}

// A fixed dummy hash lets the not-found path do the same PBKDF2 work as a real
// verification, so login response timing does not reveal whether an email exists.
const DUMMY_PASSWORD_HASH = JSON.stringify({
  algorithm: "pbkdf2-sha256-v1",
  iterations: PBKDF2_ITERATIONS,
  salt: "AAAAAAAAAAAAAAAAAAAAAA",
  hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
});

export async function verifyPasswordLogin(db, env, input) {
  const user = await getUserByEmail(db, input.email);
  const { valid, needsRehash } = await verifyUserPassword(
    env,
    user?.password_hash ?? DUMMY_PASSWORD_HASH,
    input.password,
  );

  if (!user || !valid) {
    throw unauthorized("Invalid email or password.");
  }

  if (needsRehash) {
    try {
      await db
        .prepare(
          "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(await hashUserPassword(env, input.password), user.id)
        .run();
    } catch {
      // Upgrade is best-effort; a failed rehash must not block a valid login.
    }
  }

  return user;
}

export async function assertUserEmailExists(db, email) {
  const user = await getUserByEmail(db, email);

  if (!user) {
    throw unauthorized("No account exists for this email.");
  }

  return user;
}

export async function setUserPassword(db, env, email, password) {
  const user = await assertUserEmailExists(db, email);
  const passwordHash = await hashUserPassword(env, password);

  await db
    .prepare(`
      UPDATE users
      SET password_hash = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(passwordHash, user.id)
    .run();

  return {
    updated: true,
  };
}

export async function requestSignupCode(db, env, input) {
  // Do not reveal whether the email is already registered: an existing account
  // returns the same shape without storing or sending a code.
  if (await getUserByEmail(db, input.email)) {
    return {
      email: input.email,
      expiresInMinutes: CODE_TTL_MINUTES,
      delivered: true,
    };
  }

  const code = createCode();
  await storeCode(db, env, input.email, SIGNUP_PURPOSE, code, {
    fullName: input.fullName,
    passwordHash: await hashUserPassword(env, input.password),
  });

  return {
    email: input.email,
    expiresInMinutes: CODE_TTL_MINUTES,
    ...(await sendVerificationCode(env, input.email, code)),
  };
}

export async function verifySignupCode(db, env, input) {
  const row = await findValidCode(db, env, input.email, SIGNUP_PURPOSE, input.code);

  if (!row?.full_name || !row?.password_hash) {
    throw unauthorized("Invalid or expired verification code.");
  }

  await assertSignupAvailable(db, input.email);

  const userId = createUserId(input.email);

  await db
    .prepare(`
      INSERT INTO users (id, phone_number, email, username, full_name, password_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(userId, userId, input.email, input.email, row.full_name, row.password_hash)
    .run();

  await seedUserDefaults(db, userId);
  await consumeCode(db, row.id);

  return {
    id: userId,
    email: input.email,
    fullName: row.full_name,
    username: input.email,
  };
}
