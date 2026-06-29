import { verifySession } from "../../_shared/auth.js";
import { requireDb } from "../../_shared/db.js";
import { failure, methodNotAllowed, success } from "../../_shared/json.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const session = await verifySession(request, env);

  if (session.authenticated) {
    const user = await requireDb(context)
      .prepare("SELECT email, full_name, username FROM users WHERE id = ?")
      .bind(session.session.userId)
      .first();

    return success({
      authenticated: true,
      user: user
        ? {
            email: user.email,
            fullName: user.full_name,
            username: user.username,
          }
        : null,
    });
  }

  if (session.status === 500) {
    return failure("Authentication is not configured", 500);
  }

  return failure("Authentication required", 401);
}
