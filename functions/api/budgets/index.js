import { getSessionUserId, requireAuth } from "../../_shared/auth.js";
import {
  createBudget,
  listBudgets,
  validateBudgetPayload,
} from "../../_shared/budgets.js";
import { requireDb } from "../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";

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
      await listBudgets(requireDb(context), getSessionUserId(auth.session)),
    );
  },

  async POST(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    const db = requireDb(context);
    const body = await parseJsonBody(context.request);
    const validation = validateBudgetPayload(body);

    if (!validation.ok) {
      return validation.response;
    }

    const budget = await createBudget(
      db,
      getSessionUserId(auth.session),
      validation.data,
    );

    return success(budget, 201);
  },
});
