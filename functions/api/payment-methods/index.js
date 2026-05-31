import { requireAuth } from "../../_shared/auth.js";
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

  return auth.authenticated ? null : auth.response;
}

export const onRequest = createApiHandler({
  async GET(context) {
    const authResponse = await requireAuthenticatedRequest(context);

    if (authResponse) {
      return authResponse;
    }

    return success(await listPaymentMethods(requireDb(context)));
  },

  async POST(context) {
    const authResponse = await requireAuthenticatedRequest(context);

    if (authResponse) {
      return authResponse;
    }

    const db = requireDb(context);
    const body = await parseJsonBody(context.request);
    const validation = validatePaymentMethodPayload(body);

    if (!validation.ok) {
      return validation.response;
    }

    return success(await createPaymentMethod(db, validation.data), 201);
  },
});
