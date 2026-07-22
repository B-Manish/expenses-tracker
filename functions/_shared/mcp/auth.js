import { resolveMcpToken } from "../mcpTokens.js";

function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());

  return match ? match[1].trim() : null;
}

export async function requireMcpAuthorization(request, db) {
  const presented = getBearerToken(request);

  if (!presented) {
    return { ok: false, status: 401, message: "Authentication required" };
  }

  const resolved = await resolveMcpToken(db, presented);

  if (!resolved) {
    return { ok: false, status: 401, message: "Authentication required" };
  }

  return { ok: true, userId: resolved.userId };
}
