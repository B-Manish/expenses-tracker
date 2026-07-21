import { requireDb } from "../../../_shared/db.js";
import { tooManyRequests } from "../../../_shared/errors.js";
import { createApiHandler, parseJsonBody } from "../../../_shared/http.js";
import { success } from "../../../_shared/json.js";
import { hitWindow } from "../../../_shared/rateLimit.js";
import {
  parseSignupRequestPayload,
  requestSignupCode,
} from "../../../_shared/emailAuth.js";

const SIGNUP_REQUEST_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 };

export const onRequest = createApiHandler({
  async POST(context) {
    const db = requireDb(context);
    const throttle = await hitWindow(
      db,
      "signup-request",
      context.request,
      SIGNUP_REQUEST_LIMIT,
    );

    if (throttle.blocked) {
      throw tooManyRequests("Too many signup requests", {
        headers: { "retry-after": String(throttle.retryAfterSeconds) },
      });
    }

    const body = await parseJsonBody(context.request);
    const input = parseSignupRequestPayload(body);

    return success(await requestSignupCode(db, context.env, input));
  },
});
