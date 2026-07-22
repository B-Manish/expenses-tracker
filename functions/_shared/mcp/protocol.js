import { toRupeesView } from "./serialize.js";

const JSONRPC_VERSION = "2.0";
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

export const SERVER_INFO = { name: "cashly-expenses", version: "0.1.0" };

function makeResult(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

function makeError(id, code, message) {
  return { jsonrpc: JSONRPC_VERSION, id, error: { code, message } };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function listToolDefinitions(tools) {
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  }));
}

async function callTool(id, params, ctx) {
  const tool = ctx.tools[params?.name];

  if (!tool) {
    return makeError(id, -32602, `Unknown tool: ${params?.name}`);
  }

  const args = isPlainObject(params.arguments) ? params.arguments : {};

  try {
    const raw = await tool.handler({ db: ctx.db, userId: ctx.userId, args, now: ctx.now });
    const view = toRupeesView(raw);

    return makeResult(id, {
      content: [{ type: "text", text: JSON.stringify(view, null, 2) }],
      structuredContent: isPlainObject(view) ? view : { value: view },
      isError: false,
    });
  } catch (error) {
    const message = error?.publicMessage || error?.message || "Tool execution failed";
    return makeResult(id, { content: [{ type: "text", text: message }], isError: true });
  }
}

export async function handleRpc(message, ctx) {
  if (Array.isArray(message)) {
    return makeError(null, -32600, "Batch requests are not supported");
  }

  if (!isPlainObject(message) || message.jsonrpc !== JSONRPC_VERSION || typeof message.method !== "string") {
    return makeError(message?.id ?? null, -32600, "Invalid Request");
  }

  const id = message.id ?? null;
  const params = isPlainObject(message.params) ? message.params : {};

  switch (message.method) {
    case "initialize":
      return makeResult(id, {
        protocolVersion:
          typeof params.protocolVersion === "string" ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case "notifications/initialized":
      return null;
    case "ping":
      return makeResult(id, {});
    case "tools/list":
      return makeResult(id, { tools: listToolDefinitions(ctx.tools) });
    case "tools/call":
      return callTool(id, params, ctx);
    default:
      return makeError(id, -32601, `Method not found: ${message.method}`);
  }
}
