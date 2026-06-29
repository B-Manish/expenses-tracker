import { getSessionUserId, requireAuth } from "../../../_shared/auth.js";
import { requireDb } from "../../../_shared/db.js";
import { createApiHandler } from "../../../_shared/http.js";
import { success } from "../../../_shared/json.js";
import {
  confirmSmsImport,
  validateSmsImportId,
} from "../../../_shared/smsReview.js";

export const onRequest = createApiHandler({
  async POST(context) {
    const auth = await requireAuth(context);

    if (!auth.authenticated) {
      return auth.response;
    }

    const idValidation = validateSmsImportId(context.params?.id);

    if (!idValidation.ok) {
      return idValidation.response;
    }

    return success(
      await confirmSmsImport(
        requireDb(context),
        getSessionUserId(auth.session),
        idValidation.data,
      ),
    );
  },
});
