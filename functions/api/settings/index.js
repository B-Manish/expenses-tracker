import { requireAuth } from "../../_shared/auth.js";
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

  return auth.authenticated ? null : auth.response;
}

export const onRequest = createApiHandler({
  async GET(context) {
    const authResponse = await requireAuthenticatedRequest(context);

    if (authResponse) {
      return authResponse;
    }

    return success(await getSettings(requireDb(context)));
  },

  async PUT(context) {
    const authResponse = await requireAuthenticatedRequest(context);

    if (authResponse) {
      return authResponse;
    }

    const body = await parseJsonBody(context.request);
    const validation = validateSettingsPayload(body);

    if (!validation.ok) {
      return validation.response;
    }

    return success(await updateSettings(requireDb(context), validation.data));
  },
});
