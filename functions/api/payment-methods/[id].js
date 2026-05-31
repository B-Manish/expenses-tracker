import { requireAuth } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  deletePaymentMethod,
  updatePaymentMethod,
  validatePaymentMethodId,
  validatePaymentMethodPayload,
} from "../../_shared/paymentMethods.js";

async function requireAuthenticatedRequest(context) {
  const auth = await requireAuth(context);

  return auth.authenticated ? null : auth.response;
}

function getValidatedId(context) {
  return validatePaymentMethodId(context.params?.id);
}

export const onRequest = createApiHandler({
  async PUT(context) {
    const authResponse = await requireAuthenticatedRequest(context);

    if (authResponse) {
      return authResponse;
    }

    const idValidation = getValidatedId(context);

    if (!idValidation.ok) {
      return idValidation.response;
    }

    const db = requireDb(context);
    const body = await parseJsonBody(context.request);
    const bodyValidation = validatePaymentMethodPayload(body);

    if (!bodyValidation.ok) {
      return bodyValidation.response;
    }

    return success(
      await updatePaymentMethod(db, idValidation.data, bodyValidation.data),
    );
  },

  async DELETE(context) {
    const authResponse = await requireAuthenticatedRequest(context);

    if (authResponse) {
      return authResponse;
    }

    const idValidation = getValidatedId(context);

    if (!idValidation.ok) {
      return idValidation.response;
    }

    return success(
      await deletePaymentMethod(requireDb(context), idValidation.data),
    );
  },
});
