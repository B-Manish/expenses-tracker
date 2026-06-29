import { errorResponse, internalServerError, unauthorized } from "./errors.js";

export const SESSION_COOKIE_NAME = "expenses_session";
export const DEFAULT_USER_ID = "phone:9949055750";

const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getSessionSecret(env) {
  if (!env?.SESSION_SECRET || typeof env.SESSION_SECRET !== "string") {
    return null;
  }

  return env.SESSION_SECRET;
}

export function isAuthConfigured(env) {
  return Boolean(
    env?.SESSION_SECRET &&
      typeof env.SESSION_SECRET === "string",
  );
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

function base64UrlEncodeText(value) {
  return base64UrlEncodeBytes(encoder.encode(value));
}

function base64UrlDecodeText(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return decoder.decode(bytes);
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function constantTimeEqual(first, second) {
  if (first.length !== second.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }

  return difference === 0;
}

function parseCookies(request) {
  const header = request.headers.get("cookie");
  const cookies = new Map();

  if (!header) {
    return cookies;
  }

  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    if (key) {
      cookies.set(key, value);
    }
  }

  return cookies;
}

function shouldUseSecureCookie(request) {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");

  return url.protocol === "https:" || forwardedProto === "https";
}

export async function createSessionCookie(request, env, userId = DEFAULT_USER_ID) {
  const secret = getSessionSecret(env);

  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_DURATION_SECONDS;
  const payload = base64UrlEncodeText(
    JSON.stringify({
      userId,
      iat: issuedAt,
      exp: expiresAt,
    }),
  );
  const signature = await sign(payload, secret);
  const secure = shouldUseSecureCookie(request) ? "Secure" : "";

  return [
    `${SESSION_COOKIE_NAME}=${payload}.${signature}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_DURATION_SECONDS}`,
    `Expires=${new Date(expiresAt * 1000).toUTCString()}`,
    secure.trim(),
  ]
    .filter(Boolean)
    .join("; ");
}

export function getSessionUserId(session) {
  return typeof session?.userId === "string" && session.userId.trim()
    ? session.userId.trim()
    : DEFAULT_USER_ID;
}

export function createClearSessionCookie(request) {
  const secure = shouldUseSecureCookie(request) ? "Secure" : "";

  return [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    secure.trim(),
  ]
    .filter(Boolean)
    .join("; ");
}

export async function verifySession(request, env, now = Math.floor(Date.now() / 1000)) {
  const secret = getSessionSecret(env);

  if (!secret) {
    return {
      authenticated: false,
      reason: "missing-secret",
      status: 500,
    };
  }

  const cookie = parseCookies(request).get(SESSION_COOKIE_NAME);

  if (!cookie) {
    return {
      authenticated: false,
      reason: "missing-cookie",
      status: 401,
    };
  }

  const [payload, signature, extra] = cookie.split(".");

  if (!payload || !signature || extra) {
    return {
      authenticated: false,
      reason: "malformed-cookie",
      status: 401,
    };
  }

  const expectedSignature = await sign(payload, secret);

  if (!constantTimeEqual(signature, expectedSignature)) {
    return {
      authenticated: false,
      reason: "invalid-signature",
      status: 401,
    };
  }

  let session;

  try {
    session = JSON.parse(base64UrlDecodeText(payload));
  } catch {
    return {
      authenticated: false,
      reason: "invalid-payload",
      status: 401,
    };
  }

  if (!Number.isInteger(session?.exp) || session.exp <= now) {
    return {
      authenticated: false,
      reason: "expired",
      status: 401,
    };
  }

  return {
    authenticated: true,
    session,
  };
}

export async function requireAuth(context) {
  const result = await verifySession(context.request, context.env);

  if (result.authenticated) {
    return {
      authenticated: true,
      session: result.session,
    };
  }

  if (result.status === 500) {
    return {
      authenticated: false,
      response: errorResponse(
        internalServerError("Authentication is not configured", {
          expose: true,
          publicMessage: "Authentication is not configured",
        }),
      ),
    };
  }

  return {
    authenticated: false,
    response: errorResponse(unauthorized("Authentication required")),
  };
}
