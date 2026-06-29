import { getSessionUserId, requireAuth } from "../../_shared/auth.js";
import {
  deactivateBudget,
  getBudgetById,
  updateBudget,
  validateBudgetId,
  validateBudgetPayload,
} from "../../_shared/budgets.js";
import { requireDb } from "../../_shared/db.js";
import { notFound } from "../../_shared/errors.js";
import { createApiHandler, parseJsonBody } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";

async function requireAuthenticatedRequest(context) {
  const auth = await requireAuth(context);

  return auth.authenticated ? auth : { response: auth.response };
}

function getValidatedId(context) {
  return validateBudgetId(context.params?.id);
}

export const onRequest = createApiHandler({
  async GET(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    const idValidation = getValidatedId(context);

    if (!idValidation.ok) {
      return idValidation.response;
    }

    const budget = await getBudgetById(
      requireDb(context),
      getSessionUserId(auth.session),
      idValidation.data,
    );

    if (!budget) {
      throw notFound("Budget not found");
    }

    return success(budget);
  },

  async PUT(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    const idValidation = getValidatedId(context);

    if (!idValidation.ok) {
      return idValidation.response;
    }

    const db = requireDb(context);
    const body = await parseJsonBody(context.request);
    const bodyValidation = validateBudgetPayload(body);

    if (!bodyValidation.ok) {
      return bodyValidation.response;
    }

    return success(
      await updateBudget(
        db,
        getSessionUserId(auth.session),
        idValidation.data,
        bodyValidation.data,
      ),
    );
  },

  async DELETE(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    const idValidation = getValidatedId(context);

    if (!idValidation.ok) {
      return idValidation.response;
    }

    return success(
      await deactivateBudget(
        requireDb(context),
        getSessionUserId(auth.session),
        idValidation.data,
      ),
    );
  },
});
