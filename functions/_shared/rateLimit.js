// D1-backed store for throttle state. Replaces per-isolate in-memory Maps,
// which do not share state across Cloudflare's short-lived Function isolates.
// ponytail: fixed-window rows keyed by (scope, ip); no background GC because
// rows are bounded by distinct client IPs and overwritten in place. Add a TTL
// sweep (cron) only if the table ever grows large.

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

export async function readEntry(db, scope, key) {
  const row = await db
    .prepare("SELECT value FROM rate_limits WHERE scope = ? AND key = ?")
    .bind(scope, key)
    .first();

  if (!row?.value) {
    return null;
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export async function writeEntry(db, scope, key, entry) {
  await db
    .prepare(`
      INSERT INTO rate_limits (scope, key, value, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(scope, key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(scope, key, JSON.stringify(entry))
    .run();
}

export async function deleteEntry(db, scope, key) {
  await db
    .prepare("DELETE FROM rate_limits WHERE scope = ? AND key = ?")
    .bind(scope, key)
    .run();
}

function retryAfter(windowStart, windowMs, now) {
  return Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
}

// Fixed-window limiter: read-only check whether the caller is already over the
// limit within the current window.
export async function peekWindow(db, scope, request, { windowMs, max }, now = Date.now()) {
  const key = getClientKey(request);
  const current = await readEntry(db, scope, key);

  if (!current || now - current.windowStart >= windowMs) {
    return { blocked: false };
  }

  if (current.attempts > max) {
    return { blocked: true, retryAfterSeconds: retryAfter(current.windowStart, windowMs, now) };
  }

  return { blocked: false };
}

// Fixed-window limiter: record one attempt and report whether it exceeds `max`.
export async function hitWindow(db, scope, request, { windowMs, max }, now = Date.now()) {
  const key = getClientKey(request);
  const current = await readEntry(db, scope, key);
  const fresh = current && now - current.windowStart < windowMs;
  const windowStart = fresh ? current.windowStart : now;
  const attempts = (fresh ? current.attempts : 0) + 1;

  await writeEntry(db, scope, key, { windowStart, attempts });

  if (attempts > max) {
    return { blocked: true, retryAfterSeconds: retryAfter(windowStart, windowMs, now) };
  }

  return { blocked: false };
}

export async function clearWindow(db, scope, request) {
  await deleteEntry(db, scope, getClientKey(request));
}
