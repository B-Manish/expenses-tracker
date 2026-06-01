const PASSWORD_SETTINGS_KEY = "app_password_hash";
const PBKDF2_ITERATIONS = 120000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const APP_AUTH_TABLE = "app_auth";
const LEGACY_SETTINGS_TABLE = "settings";
const encoder = new TextEncoder();

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

async function deriveHash(password, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations,
      salt,
    },
    key,
    HASH_BYTES * 8,
  );

  return new Uint8Array(bits);
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

  return new Uint8Array(signature);
}

function getPasswordPepper(env) {
  return typeof env?.SESSION_SECRET === "string" && env.SESSION_SECRET
    ? env.SESSION_SECRET
    : null;
}

async function ensureAppAuthTable(db) {
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS ${APP_AUTH_TABLE} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    .run();
}

function parseStoredPasswordHash(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);

    if (typeof parsed?.salt !== "string" || typeof parsed?.hash !== "string") {
      return null;
    }

    if (parsed.algorithm === "hmac-sha256-v1") {
      return parsed;
    }

    if (!parsed.algorithm && Number.isInteger(parsed?.iterations)) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

async function readPasswordConfig(db, tableName) {
  const row = await db
    .prepare(`SELECT value FROM ${tableName} WHERE key = ?`)
    .bind(PASSWORD_SETTINGS_KEY)
    .first();

  return parseStoredPasswordHash(row?.value);
}

export function validateNewPassword(password) {
  if (typeof password !== "string" || !password.trim()) {
    return "Password is required.";
  }

  if (password.trim().length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (password.length > 200) {
    return "Password must be 200 characters or less.";
  }

  return null;
}

export async function getStoredPasswordConfig(db) {
  await ensureAppAuthTable(db);

  const stored = await readPasswordConfig(db, APP_AUTH_TABLE);

  if (stored) {
    return stored;
  }

  try {
    return await readPasswordConfig(db, LEGACY_SETTINGS_TABLE);
  } catch {
    return null;
  }
}

export async function hashAppPassword(env, password) {
  const pepper = getPasswordPepper(env);

  if (!pepper) {
    throw new Error("SESSION_SECRET is not configured");
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const saltText = bytesToBase64Url(salt);
  const hash = await hmacSha256(`${saltText}:${password}`, pepper);

  return JSON.stringify({
    algorithm: "hmac-sha256-v1",
    salt: saltText,
    hash: bytesToBase64Url(hash),
  });
}

export async function verifyAppPassword(db, env, password) {
  const stored = await getStoredPasswordConfig(db);

  if (stored) {
    if (stored.algorithm === "hmac-sha256-v1") {
      const pepper = getPasswordPepper(env);

      if (!pepper) {
        return false;
      }

      const actualHash = await hmacSha256(`${stored.salt}:${password}`, pepper);
      const expectedHash = base64UrlToBytes(stored.hash);

      return constantTimeEqual(actualHash, expectedHash);
    }

    const actualHash = await deriveHash(
      password,
      base64UrlToBytes(stored.salt),
      stored.iterations,
    );
    const expectedHash = base64UrlToBytes(stored.hash);

    return constantTimeEqual(actualHash, expectedHash);
  }

  return password === env.APP_PASSWORD;
}

export async function setAppPassword(db, env, password) {
  await ensureAppAuthTable(db);

  const passwordHash = await hashAppPassword(env, password);

  await db
    .prepare(`
      INSERT INTO ${APP_AUTH_TABLE} (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(PASSWORD_SETTINGS_KEY, passwordHash)
    .run();
}
