const encoder = new TextEncoder();

// ponytail: sha256 + constantTimeEqual duplicated from smsImports.js to avoid
// touching the working SMS auth path. Extract to a shared crypto helper only if
// a third consumer appears.
async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function constantTimeEqual(first, second) {
  if (first.byteLength !== second.byteLength) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < first.byteLength; index += 1) {
    difference |= first[index] ^ second[index];
  }

  return difference === 0;
}

function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());

  return match ? match[1].trim() : null;
}

export async function requireMcpAuthorization(request, env) {
  const configured = env?.MCP_TOKEN;

  if (typeof configured !== "string" || configured.length < 32) {
    return { ok: false, status: 500, message: "MCP server is not configured" };
  }

  const presented = getBearerToken(request);

  if (!presented) {
    return { ok: false, status: 401, message: "Authentication required" };
  }

  const [presentedHash, configuredHash] = await Promise.all([sha256(presented), sha256(configured)]);

  if (!constantTimeEqual(presentedHash, configuredHash)) {
    return { ok: false, status: 401, message: "Authentication required" };
  }

  return { ok: true };
}
