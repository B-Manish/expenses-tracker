import { getSessionUserId, requireAuth } from "../../../_shared/auth.js";
import { requireDb } from "../../../_shared/db.js";
import { createApiHandler } from "../../../_shared/http.js";
import { success } from "../../../_shared/json.js";
import { revokeMcpToken, validateMcpTokenId } from "../../../_shared/mcpTokens.js";

async function requireAuthenticatedRequest(context) {
  const auth = await requireAuth(context);

  return auth.authenticated ? auth : { response: auth.response };
}

export const onRequest = createApiHandler({
  async DELETE(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    const idValidation = validateMcpTokenId(context.params?.id);

    if (!idValidation.ok) {
      return idValidation.response;
    }

    return success(
      await revokeMcpToken(requireDb(context), getSessionUserId(auth.session), idValidation.data),
    );
  },
});
