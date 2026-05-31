import { requireAuth } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { createApiHandler } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  getDashboardStats,
  validateStatsQuery,
} from "../../_shared/stats.js";

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

    const url = new URL(context.request.url);
    const validation = validateStatsQuery(url.searchParams);

    if (!validation.ok) {
      return validation.response;
    }

    return success(
      await getDashboardStats(requireDb(context), validation.data),
    );
  },
});
