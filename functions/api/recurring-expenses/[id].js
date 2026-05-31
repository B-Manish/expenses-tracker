import { getSessionUserId, requireAuth } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { notFound } from "../../_shared/errors.js";
import { createApiHandler, parseJsonBody } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  deactivateRecurringExpense,
  getRecurringExpenseById,
  updateRecurringExpense,
  validateRecurringExpenseId,
  validateRecurringExpensePayload,
} from "../../_shared/recurringExpenses.js";

async function requireAuthenticatedRequest(context) {
  const auth = await requireAuth(context);

  return auth.authenticated ? auth : { response: auth.response };
}

function getValidatedId(context) {
  return validateRecurringExpenseId(context.params?.id);
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

    const recurringExpense = await getRecurringExpenseById(
      requireDb(context),
      getSessionUserId(auth.session),
      idValidation.data,
    );

    if (!recurringExpense) {
      throw notFound("Recurring expense not found");
    }

    return success(recurringExpense);
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
    const bodyValidation = validateRecurringExpensePayload(body);

    if (!bodyValidation.ok) {
      return bodyValidation.response;
    }

    return success(
      await updateRecurringExpense(
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
      await deactivateRecurringExpense(
        requireDb(context),
        getSessionUserId(auth.session),
        idValidation.data,
      ),
    );
  },
});
