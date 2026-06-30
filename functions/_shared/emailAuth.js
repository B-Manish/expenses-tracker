import { z } from "zod";
import { conflict, internalServerError, unauthorized } from "./errors.js";
import { parseValidated } from "./validation.js";

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const SIGNUP_PURPOSE = "SIGNUP";
const SALT_BYTES = 16;
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

async function hashUserPassword(env, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const saltText = bytesToBase64Url(salt);
  const hash = await hmacSha256Bytes(`${saltText}:${password}`, getSessionSecret(env));

  return JSON.stringify({
    algorithm: "hmac-sha256-v1",
    salt: saltText,
    hash: bytesToBase64Url(hash),
  });
}

async function verifyUserPassword(env, storedValue, password) {
  if (!storedValue) {
    return typeof env?.APP_PASSWORD === "string" && password === env.APP_PASSWORD;
  }

  let stored;

  try {
    stored = JSON.parse(storedValue);
  } catch {
    return false;
  }

  if (stored?.algorithm !== "hmac-sha256-v1" || !stored.salt || !stored.hash) {
    return false;
  }

  const actualHash = await hmacSha256Bytes(`${stored.salt}:${password}`, getSessionSecret(env));
  const expectedHash = base64UrlToBytes(stored.hash);

  return constantTimeEqual(actualHash, expectedHash);
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
  if (env?.EMAIL_DEV_SHOW_CODES === "true") {
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

export async function verifyPasswordLogin(db, env, input) {
  const user = await getUserByEmail(db, input.email);

  if (!user) {
    throw unauthorized("Invalid email or password.");
  }

  if (!user.password_hash && input.password === user.email) {
    const passwordHash = await hashUserPassword(env, input.password);

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
      ...user,
      password_hash: passwordHash,
    };
  }

  if (!(await verifyUserPassword(env, user.password_hash, input.password))) {
    throw unauthorized("Invalid email or password.");
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
  await assertSignupAvailable(db, input.email);

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
