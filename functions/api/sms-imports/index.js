import { getSessionUserId, requireAuth } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { createApiHandler } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  listSmsImports,
  validateSmsImportQuery,
} from "../../_shared/smsReview.js";

export const onRequest = createApiHandler({
  async GET(context) {
    const auth = await requireAuth(context);

    if (!auth.authenticated) {
      return auth.response;
    }

    const db = requireDb(context);
    const url = new URL(context.request.url);
    const validation = validateSmsImportQuery(url.searchParams);

    if (!validation.ok) {
      return validation.response;
    }

    return success(
      await listSmsImports(db, getSessionUserId(auth.session), validation.data),
    );
  },
});
