import { createSessionCookie, isAuthConfigured } from "../../_shared/auth.js";
import { failure, methodNotAllowed, success } from "../../_shared/json.js";
import { readJsonBody } from "../../_shared/http.js";
import { ApiError } from "../../_shared/errors.js";
import {
  parsePasswordLoginPayload,
  verifyPasswordLogin,
} from "../../_shared/emailAuth.js";
import {
  clearFailedLogins,
  getThrottleStatus,
  recordFailedLogin,
} from "../../_shared/security.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (!isAuthConfigured(env)) {
    return failure("Authentication is not configured", 500);
  }

  if (!env.DB) {
    return failure("Database binding is not configured", 500);
  }

  const throttleStatus = await getThrottleStatus(env.DB, request);

  if (throttleStatus.blocked) {
    return failure("Too many failed login attempts", 429, {
      "retry-after": String(throttleStatus.retryAfterSeconds),
    });
  }

  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  let validation;

  try {
    validation = parsePasswordLoginPayload(bodyResult.data);
  } catch (error) {
    return failure(
      error instanceof ApiError ? error.publicMessage : "Invalid login details",
      error instanceof ApiError ? error.status : 400,
    );
  }

  let user;
  try {
    user = await verifyPasswordLogin(env.DB, env, validation);
  } catch {
    const failureStatus = await recordFailedLogin(env.DB, request);

    if (failureStatus.blocked) {
      return failure("Too many failed login attempts", 429, {
        "retry-after": String(failureStatus.retryAfterSeconds),
      });
    }

    return failure("Invalid email or password", 401);
  }

  await clearFailedLogins(env.DB, request);

  try {
    const sessionCookie = await createSessionCookie(request, env, user.id);

    return success(
      {
        authenticated: true,
        user: {
          email: user.email,
          fullName: user.full_name,
          username: user.username,
        },
      },
      200,
      {
        "set-cookie": sessionCookie,
      },
    );
  } catch {
    return failure("Authentication is not configured", 500);
  }
}
