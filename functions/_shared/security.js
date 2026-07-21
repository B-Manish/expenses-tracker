import { deleteEntry, getClientKey, readEntry, writeEntry } from "./rateLimit.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;
const SCOPE = "login";

export { getClientKey };

export async function getThrottleStatus(db, request, now = Date.now()) {
  const key = getClientKey(request);
  const entry = await readEntry(db, SCOPE, key);

  if (!entry) {
    return { blocked: false, key };
  }

  if (entry.blockedUntil && entry.blockedUntil > now) {
    return {
      blocked: true,
      key,
      retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000),
    };
  }

  if (entry.blockedUntil && entry.blockedUntil <= now) {
    await deleteEntry(db, SCOPE, key);
    return { blocked: false, key };
  }

  return { blocked: false, key };
}

export async function recordFailedLogin(db, request, now = Date.now()) {
  const key = getClientKey(request);
  const current = await readEntry(db, SCOPE, key);
  const attempts = current ? current.attempts + 1 : 1;
  const shouldBlock = attempts >= MAX_FAILED_ATTEMPTS;

  await writeEntry(db, SCOPE, key, {
    attempts,
    lastAttemptAt: now,
    blockedUntil: shouldBlock ? now + LOGIN_BLOCK_MS : 0,
  });

  return {
    blocked: shouldBlock,
    retryAfterSeconds: shouldBlock ? Math.ceil(LOGIN_BLOCK_MS / 1000) : 0,
  };
}

export async function clearFailedLogins(db, request) {
  await deleteEntry(db, SCOPE, getClientKey(request));
}
