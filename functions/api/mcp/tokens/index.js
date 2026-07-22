import { getSessionUserId, requireAuth } from "../../../_shared/auth.js";
import { requireDb } from "../../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../../_shared/http.js";
import { success } from "../../../_shared/json.js";
import {
  createMcpToken,
  listMcpTokens,
  validateMcpTokenLabel,
} from "../../../_shared/mcpTokens.js";

async function requireAuthenticatedRequest(context) {
  const auth = await requireAuth(context);

  return auth.authenticated ? auth : { response: auth.response };
}

export const onRequest = createApiHandler({
  async GET(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    return success(
      await listMcpTokens(requireDb(context), getSessionUserId(auth.session)),
    );
  },

  async POST(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    const body = await parseJsonBody(context.request, { required: false });
    const validation = validateMcpTokenLabel(body?.label);

    if (!validation.ok) {
      return validation.response;
    }

    return success(
      await createMcpToken(requireDb(context), getSessionUserId(auth.session), validation.data),
      201,
    );
  },
});
