import { createSessionCookie } from "../../../_shared/auth.js";
import { requireDb } from "../../../_shared/db.js";
import { ApiError, tooManyRequests } from "../../../_shared/errors.js";
import { createApiHandler, parseJsonBody } from "../../../_shared/http.js";
import { success } from "../../../_shared/json.js";
import { clearWindow, hitWindow, peekWindow } from "../../../_shared/rateLimit.js";
import {
  parseSignupVerifyPayload,
  verifySignupCode,
} from "../../../_shared/emailAuth.js";

const SIGNUP_VERIFY_SCOPE = "signup-verify";
const SIGNUP_VERIFY_LIMIT = { windowMs: 10 * 60 * 1000, max: 10 };

export const onRequest = createApiHandler({
  async POST(context) {
    const db = requireDb(context);
    const blocked = await peekWindow(
      db,
      SIGNUP_VERIFY_SCOPE,
      context.request,
      SIGNUP_VERIFY_LIMIT,
    );

    if (blocked.blocked) {
      throw tooManyRequests("Too many verification attempts", {
        headers: { "retry-after": String(blocked.retryAfterSeconds) },
      });
    }

    const body = await parseJsonBody(context.request);
    const input = parseSignupVerifyPayload(body);

    let user;

    try {
      user = await verifySignupCode(db, context.env, input);
    } catch (error) {
      // Count failed code guesses so the 6-digit code cannot be brute-forced.
      if (error instanceof ApiError && error.status === 401) {
        const failure = await hitWindow(
          db,
          SIGNUP_VERIFY_SCOPE,
          context.request,
          SIGNUP_VERIFY_LIMIT,
        );

        if (failure.blocked) {
          throw tooManyRequests("Too many verification attempts", {
            headers: { "retry-after": String(failure.retryAfterSeconds) },
          });
        }
      }

      throw error;
    }

    await clearWindow(db, SIGNUP_VERIFY_SCOPE, context.request);

    const sessionCookie = await createSessionCookie(context.request, context.env, user.id);

    return success(
      {
        authenticated: true,
        user: {
          email: user.email,
          fullName: user.fullName,
          username: user.username,
        },
      },
      201,
      {
        "set-cookie": sessionCookie,
      },
    );
  },
});
