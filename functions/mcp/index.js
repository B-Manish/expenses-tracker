import { requireDb } from "../_shared/db.js";
import { requireMcpAuthorization } from "../_shared/mcp/auth.js";
import { handleRpc } from "../_shared/mcp/protocol.js";
import { tools } from "../_shared/mcp/tools.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function rpcErrorBody(code, message) {
  return { jsonrpc: "2.0", id: null, error: { code, message } };
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  try {
    const db = requireDb(context);
    const auth = await requireMcpAuthorization(request, db);

    if (!auth.ok) {
      return jsonResponse(rpcErrorBody(-32001, auth.message), auth.status);
    }

    let message;

    try {
      message = JSON.parse(await request.text());
    } catch {
      return jsonResponse(rpcErrorBody(-32700, "Parse error"), 200);
    }

    const response = await handleRpc(message, {
      db,
      userId: auth.userId,
      tools,
      now: new Date(),
    });

    if (response === null) {
      return new Response(null, { status: 202 });
    }

    return jsonResponse(response, 200);
  } catch {
    return jsonResponse(rpcErrorBody(-32603, "Internal error"), 500);
  }
}
