import { createSessionCookie } from "../../../_shared/auth.js";
import { requireDb } from "../../../_shared/db.js";
import { createApiHandler, parseJsonBody } from "../../../_shared/http.js";
import { success } from "../../../_shared/json.js";
import {
  parseSignupVerifyPayload,
  verifySignupCode,
} from "../../../_shared/emailAuth.js";

export const onRequest = createApiHandler({
  async POST(context) {
    const body = await parseJsonBody(context.request);
    const input = parseSignupVerifyPayload(body);
    const user = await verifySignupCode(requireDb(context), context.env, input);
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
