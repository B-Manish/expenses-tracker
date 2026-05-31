const MAX_FAILED_ATTEMPTS = 5;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;

const failedLoginAttempts =
  globalThis.__expensesTrackerFailedLoginAttempts ??
  new Map();

globalThis.__expensesTrackerFailedLoginAttempts = failedLoginAttempts;

export function getClientKey(request) {
  const directIp = request.headers.get("cf-connecting-ip");
  if (directIp) {
    return directIp;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return "local-development";
}

export function getThrottleStatus(request, now = Date.now()) {
  const key = getClientKey(request);
  const entry = failedLoginAttempts.get(key);

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
    failedLoginAttempts.delete(key);
    return { blocked: false, key };
  }

  return { blocked: false, key };
}

export function recordFailedLogin(request, now = Date.now()) {
  const key = getClientKey(request);
  const current = failedLoginAttempts.get(key);
  const attempts = current ? current.attempts + 1 : 1;
  const shouldBlock = attempts >= MAX_FAILED_ATTEMPTS;

  const entry = {
    attempts,
    lastAttemptAt: now,
    blockedUntil: shouldBlock ? now + LOGIN_BLOCK_MS : 0,
  };

  failedLoginAttempts.set(key, entry);

  return {
    blocked: shouldBlock,
    retryAfterSeconds: shouldBlock ? Math.ceil(LOGIN_BLOCK_MS / 1000) : 0,
  };
}

export function clearFailedLogins(request) {
  failedLoginAttempts.delete(getClientKey(request));
}

