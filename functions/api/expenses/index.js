import { requireAuth } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  createTransaction,
  listTransactions,
  validateTransactionPayload,
  validateTransactionQuery,
} from "../../_shared/transactions.js";

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

    const db = requireDb(context);
    const url = new URL(context.request.url);
    const validation = validateTransactionQuery(url.searchParams);

    if (!validation.ok) {
      return validation.response;
    }

    return success(await listTransactions(db, validation.data));
  },

  async POST(context) {
    const authResponse = await requireAuthenticatedRequest(context);

    if (authResponse) {
      return authResponse;
    }

    const db = requireDb(context);
    const body = await parseJsonBody(context.request);
    const validation = validateTransactionPayload(body);

    if (!validation.ok) {
      return validation.response;
    }

    const transaction = await createTransaction(db, validation.data);

    return success(transaction, 201);
  },
});
