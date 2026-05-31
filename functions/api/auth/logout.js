import { createClearSessionCookie } from "../../_shared/auth.js";
import { methodNotAllowed, success } from "../../_shared/json.js";

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  return success(
    { authenticated: false },
    200,
    {
      "set-cookie": createClearSessionCookie(request),
    },
  );
}

