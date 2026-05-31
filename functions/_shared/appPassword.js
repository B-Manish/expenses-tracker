const PASSWORD_SETTINGS_KEY = "app_password_hash";
const PBKDF2_ITERATIONS = 120000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
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

function parseStoredPasswordHash(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);

    if (
      typeof parsed?.salt !== "string" ||
      typeof parsed?.hash !== "string" ||
      !Number.isInteger(parsed?.iterations)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
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
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(PASSWORD_SETTINGS_KEY)
    .first();

  return parseStoredPasswordHash(row?.value);
}

export async function hashAppPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveHash(password, salt);

  return JSON.stringify({
    salt: bytesToBase64Url(salt),
    hash: bytesToBase64Url(hash),
    iterations: PBKDF2_ITERATIONS,
  });
}

export async function verifyAppPassword(db, env, password) {
  const stored = await getStoredPasswordConfig(db);

  if (stored) {
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

export async function setAppPassword(db, password) {
  const passwordHash = await hashAppPassword(password);

  await db
    .prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(PASSWORD_SETTINGS_KEY, passwordHash)
    .run();
}
