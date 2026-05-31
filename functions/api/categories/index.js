import { requireAuth } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  createCategory,
  listCategories,
  validateCategoryPayload,
  validateCategoryQuery,
} from "../../_shared/categories.js";

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
    const validation = validateCategoryQuery(url.searchParams);

    if (!validation.ok) {
      return validation.response;
    }

    return success(await listCategories(db, validation.data));
  },

  async POST(context) {
    const authResponse = await requireAuthenticatedRequest(context);

    if (authResponse) {
      return authResponse;
    }

    const db = requireDb(context);
    const body = await parseJsonBody(context.request);
    const validation = validateCategoryPayload(body);

    if (!validation.ok) {
      return validation.response;
    }

    return success(await createCategory(db, validation.data), 201);
  },
});
