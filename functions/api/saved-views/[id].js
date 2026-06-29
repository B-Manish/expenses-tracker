import { getSessionUserId, requireAuth } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  deleteSavedView,
  updateSavedView,
  validateSavedViewId,
  validateSavedViewPayload,
} from "../../_shared/savedViews.js";

async function requireAuthenticatedRequest(context) {
  const auth = await requireAuth(context);

  return auth.authenticated ? auth : { response: auth.response };
}

function getValidatedId(context) {
  return validateSavedViewId(context.params?.id);
}

export const onRequest = createApiHandler({
  async PATCH(context) {
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
    const bodyValidation = validateSavedViewPayload(body, { partial: true });

    if (!bodyValidation.ok) {
      return bodyValidation.response;
    }

    return success(
      await updateSavedView(
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
      await deleteSavedView(
        requireDb(context),
        getSessionUserId(auth.session),
        idValidation.data,
      ),
    );
  },
});
