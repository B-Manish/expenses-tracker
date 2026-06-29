import { failure, methodNotAllowed, success } from "../../../_shared/json.js";
import { readJsonBody } from "../../../_shared/http.js";
import { validateNewPassword } from "../../../_shared/appPassword.js";
import { setUserPassword } from "../../../_shared/emailAuth.js";
import {
  consumeResetPasswordToken,
  isPasswordResetConfigured,
} from "../../../_shared/passwordReset.js";

function getPayload(body) {
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  return {
    token: token || null,
    password,
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (!isPasswordResetConfigured(env)) {
    return failure("Authentication is not configured", 500);
  }

  if (!env.DB) {
    return failure("Password reset storage is not configured", 500);
  }

  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const { password, token } = getPayload(bodyResult.data);
  const passwordError = validateNewPassword(password);

  if (!token) {
    return failure("Reset session is required", 400);
  }

  if (passwordError) {
    return failure(passwordError, 400);
  }

  const consumedToken = await consumeResetPasswordToken(env, token);

  if (!consumedToken.ok) {
    return failure(consumedToken.message, consumedToken.status);
  }

  try {
    await setUserPassword(env.DB, env, consumedToken.email, password.trim());
    return success({ reset: true });
  } catch (error) {
    console.error("Password reset update failed", error);
    return failure("Could not update password. Please check the production D1 binding and migrations.", 500);
  }
}
