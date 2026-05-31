import { getSessionUserId, requireAuth } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { createApiHandler } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  getDashboardStats,
  validateStatsQuery,
} from "../../_shared/stats.js";

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

    const url = new URL(context.request.url);
    const validation = validateStatsQuery(url.searchParams);

    if (!validation.ok) {
      return validation.response;
    }

    return success(
      await getDashboardStats(requireDb(context), validation.data, {
        userId: getSessionUserId(auth.session),
      }),
    );
  },
});
