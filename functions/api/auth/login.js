import { createSessionCookie, isAuthConfigured } from "../../_shared/auth.js";
import { verifyAppPassword } from "../../_shared/appPassword.js";
import { failure, methodNotAllowed, success } from "../../_shared/json.js";
import { readJsonBody } from "../../_shared/http.js";
import {
  clearFailedLogins,
  getThrottleStatus,
  recordFailedLogin,
} from "../../_shared/security.js";

function getPasswordFromBody(body) {
  if (!body || typeof body.password !== "string") {
    return null;
  }

  return body.password.trim().length > 0 ? body.password : null;
}

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

  const throttleStatus = getThrottleStatus(request);

  if (throttleStatus.blocked) {
    return failure("Too many failed login attempts", 429, {
      "retry-after": String(throttleStatus.retryAfterSeconds),
    });
  }

  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const password = getPasswordFromBody(bodyResult.data);

  if (!password) {
    return failure("Password is required", 400);
  }

  const passwordMatches = await verifyAppPassword(env.DB, env, password);

  if (!passwordMatches) {
    const failureStatus = recordFailedLogin(request);

    if (failureStatus.blocked) {
      return failure("Too many failed login attempts", 429, {
        "retry-after": String(failureStatus.retryAfterSeconds),
      });
    }

    return failure("Invalid password", 401);
  }

  clearFailedLogins(request);

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
