import assert from "node:assert/strict";
import test from "node:test";
import { requireMcpAuthorization } from "../functions/_shared/mcp/auth.js";

const TOKEN = "test-mcp-token-at-least-32-characters-long";

function req(headers = {}) {
  return new Request("https://tracker.example/mcp", { method: "POST", headers });
}

test("requireMcpAuthorization rejects when MCP_TOKEN is not configured", async () => {
  const result = await requireMcpAuthorization(req({ authorization: `Bearer ${TOKEN}` }), {});
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
});

test("requireMcpAuthorization rejects a missing Authorization header", async () => {
  const result = await requireMcpAuthorization(req(), { MCP_TOKEN: TOKEN });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("requireMcpAuthorization rejects a wrong token", async () => {
  const result = await requireMcpAuthorization(
    req({ authorization: "Bearer wrong-token-wrong-token-wrong-token-xx" }),
    { MCP_TOKEN: TOKEN },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("requireMcpAuthorization accepts the correct bearer token", async () => {
  const result = await requireMcpAuthorization(req({ authorization: `Bearer ${TOKEN}` }), { MCP_TOKEN: TOKEN });
  assert.equal(result.ok, true);
});
