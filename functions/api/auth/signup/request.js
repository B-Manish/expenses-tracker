import { requireDb } from "../../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../../_shared/http.js";
import { success } from "../../../_shared/json.js";
import {
  parseSignupRequestPayload,
  requestSignupCode,
} from "../../../_shared/emailAuth.js";

export const onRequest = createApiHandler({
  async POST(context) {
    const body = await parseJsonBody(context.request);
    const input = parseSignupRequestPayload(body);

    return success(await requestSignupCode(requireDb(context), context.env, input));
  },
});
