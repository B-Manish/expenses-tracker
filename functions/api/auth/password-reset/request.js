import { isAuthConfigured } from "../../../_shared/auth.js";
import { failure, methodNotAllowed, success } from "../../../_shared/json.js";
import { readJsonBody } from "../../../_shared/http.js";
import { assertUserEmailExists } from "../../../_shared/emailAuth.js";
import {
  createResetCode,
  deletePasswordResetCode,
  getPasswordResetEmailConfigStatus,
  isPasswordResetConfigured,
  maskEmail,
  recordPasswordResetRequest,
  sendPasswordResetCode,
  storePasswordResetCode,
} from "../../../_shared/passwordReset.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (!isAuthConfigured(env) || !isPasswordResetConfigured(env)) {
    return failure("Authentication is not configured", 500);
  }

  if (!env.DB) {
    return failure("Password reset storage is not configured", 500);
  }

  const emailStatus = context.env?.EMAIL_DEV_SHOW_CODES === "true"
    ? { configured: true }
    : getPasswordResetEmailConfigStatus(env);

  if (!emailStatus.configured) {
    return failure(emailStatus.message, 500);
  }

  const throttleStatus = recordPasswordResetRequest(request);

  if (throttleStatus.blocked) {
    return failure("Too many password reset requests", 429, {
      "retry-after": String(throttleStatus.retryAfterSeconds),
    });
  }

  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const email = typeof bodyResult.data?.email === "string"
    ? bodyResult.data.email.trim().toLowerCase()
    : "";

  if (!email) {
    return failure("Email is required", 400);
  }

  try {
    await assertUserEmailExists(env.DB, email);
  } catch {
    return failure("No account exists for this email", 404);
  }

  const code = createResetCode();
  let storedCode;

  try {
    storedCode = await storePasswordResetCode(env, email, code);
  } catch {
    return failure("Password reset is unavailable", 500);
  }

  const delivery = await sendPasswordResetCode(env, email, code);

  if (!delivery.ok) {
    try {
      await deletePasswordResetCode(env, email, storedCode.codeHash);
    } catch {
      // The code expires quickly; preserve the delivery failure for the caller.
    }

    return failure(delivery.message, delivery.status);
  }

  return success({
    email: maskEmail(email),
    expiresInMinutes: storedCode.expiresInMinutes,
    devCode: delivery.devCode,
  });
}
