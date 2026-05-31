import { createApiHandler } from "../_shared/http.js";
import { success } from "../_shared/json.js";

export const onRequest = createApiHandler({
  GET: () => success({ status: "ok" }),
});

