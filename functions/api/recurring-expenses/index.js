import { getSessionUserId, requireAuth } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  createRecurringExpense,
  listRecurringExpenses,
  validateRecurringExpensePayload,
} from "../../_shared/recurringExpenses.js";

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
      await listRecurringExpenses(
        requireDb(context),
        getSessionUserId(auth.session),
      ),
    );
  },

  async POST(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    const db = requireDb(context);
    const body = await parseJsonBody(context.request);
    const validation = validateRecurringExpensePayload(body);

    if (!validation.ok) {
      return validation.response;
    }

    const recurringExpense = await createRecurringExpense(
      db,
      getSessionUserId(auth.session),
      validation.data,
    );

    return success(recurringExpense, 201);
  },
});
