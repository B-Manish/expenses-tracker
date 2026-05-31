import { verifySession } from "../../_shared/auth.js";
import { failure, methodNotAllowed, success } from "../../_shared/json.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const session = await verifySession(request, env);

  if (session.authenticated) {
    return success({ authenticated: true });
  }

  if (session.status === 500) {
    return failure("Authentication is not configured", 500);
  }

  return failure("Authentication required", 401);
}

