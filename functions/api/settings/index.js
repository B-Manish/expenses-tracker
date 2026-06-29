import { getSessionUserId, requireAuth } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  getSettings,
  updateSettings,
  validateSettingsPayload,
} from "../../_shared/settings.js";

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

    return success(await getSettings(requireDb(context), getSessionUserId(auth.session)));
  },

  async PUT(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    const body = await parseJsonBody(context.request);
    const validation = validateSettingsPayload(body);

    if (!validation.ok) {
      return validation.response;
    }

    return success(await updateSettings(requireDb(context), getSessionUserId(auth.session), validation.data));
  },
});
