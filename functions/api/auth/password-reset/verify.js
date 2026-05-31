import { createSessionCookie, isAuthConfigured } from "../../../_shared/auth.js";
import { failure, methodNotAllowed, success } from "../../../_shared/json.js";
import { readJsonBody } from "../../../_shared/http.js";
import {
  clearPasswordResetVerifyFailures,
  consumePasswordResetCode,
  getPasswordResetRecipient,
  getPasswordResetVerifyThrottleStatus,
  normalizeResetCode,
  recordPasswordResetVerifyFailure,
} from "../../../_shared/passwordReset.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (!isAuthConfigured(env)) {
    return failure("Authentication is not configured", 500);
  }

  if (!env.DB) {
    return failure("Password reset storage is not configured", 500);
  }

  const throttleStatus = getPasswordResetVerifyThrottleStatus(request);

  if (throttleStatus.blocked) {
    return failure("Too many verification attempts", 429, {
      "retry-after": String(throttleStatus.retryAfterSeconds),
    });
  }

  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const code = normalizeResetCode(bodyResult.data?.code);

  if (!code) {
    return failure("Enter the 6-digit verification code", 400);
  }

  let verified;

  try {
    verified = await consumePasswordResetCode(env, getPasswordResetRecipient(env), code);
  } catch {
    return failure("Password reset is unavailable", 500);
  }

  if (!verified.ok) {
    const failureStatus = recordPasswordResetVerifyFailure(request);

    if (failureStatus.blocked) {
      return failure("Too many verification attempts", 429, {
        "retry-after": String(failureStatus.retryAfterSeconds),
      });
    }

    return failure(verified.message, verified.status);
  }

  clearPasswordResetVerifyFailures(request);

  try {
    const sessionCookie = await createSessionCookie(request, env);

    return success(
      { authenticated: true },
      200,
      {
        "set-cookie": sessionCookie,
      },
    );
  } catch {
    return failure("Authentication is not configured", 500);
  }
}
