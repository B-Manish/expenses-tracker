import { isAuthConfigured } from "../../../_shared/auth.js";
import { failure, methodNotAllowed, success } from "../../../_shared/json.js";
import {
  createResetCode,
  deletePasswordResetCode,
  getPasswordResetEmailConfigStatus,
  getPasswordResetRecipient,
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

  const emailStatus = getPasswordResetEmailConfigStatus(env);

  if (!emailStatus.configured) {
    return failure(emailStatus.message, 500);
  }

  const throttleStatus = recordPasswordResetRequest(request);

  if (throttleStatus.blocked) {
    return failure("Too many password reset requests", 429, {
      "retry-after": String(throttleStatus.retryAfterSeconds),
    });
  }

  const email = getPasswordResetRecipient(env);
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
  });
}
