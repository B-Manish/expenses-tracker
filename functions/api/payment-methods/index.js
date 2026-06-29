import { getSessionUserId, requireAuth } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  createPaymentMethod,
  listPaymentMethods,
  validatePaymentMethodPayload,
} from "../../_shared/paymentMethods.js";

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

    return success(await listPaymentMethods(requireDb(context), getSessionUserId(auth.session)));
  },

  async POST(context) {
    const auth = await requireAuthenticatedRequest(context);

    if (auth.response) {
      return auth.response;
    }

    const db = requireDb(context);
    const body = await parseJsonBody(context.request);
    const validation = validatePaymentMethodPayload(body);

    if (!validation.ok) {
      return validation.response;
    }

    return success(await createPaymentMethod(db, getSessionUserId(auth.session), validation.data), 201);
  },
});
