import { getSessionUserId, requireAuth } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  deleteTransaction,
  getTransactionById,
  updateTransaction,
  validateTransactionId,
  validateTransactionPayload,
} from "../../_shared/transactions.js";
import { notFound } from "../../_shared/errors.js";

async function requireAuthenticatedRequest(context) {
  const auth = await requireAuth(context);

  return auth.authenticated ? auth : { response: auth.response };
}

function getValidatedId(context) {
  const validation = validateTransactionId(context.params?.id);

  if (!validation.ok) {
    return validation;
  }

  return validation;
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

    const transaction = await getTransactionById(
      requireDb(context),
      getSessionUserId(auth.session),
      idValidation.data,
    );

    if (!transaction) {
      throw notFound("Transaction not found");
    }

    return success(transaction);
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
    const bodyValidation = validateTransactionPayload(body);

    if (!bodyValidation.ok) {
      return bodyValidation.response;
    }

    return success(
      await updateTransaction(db, getSessionUserId(auth.session), idValidation.data, bodyValidation.data),
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

    return success(await deleteTransaction(requireDb(context), getSessionUserId(auth.session), idValidation.data));
  },
});
