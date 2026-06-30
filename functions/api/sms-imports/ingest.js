import { requireDb } from "../../_shared/db.js";
import { createApiHandler } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  ingestSmsImport,
  parseSmsIngestPayload,
  readSmsIngestJson,
  requireSmsIngestAuthorization,
} from "../../_shared/smsImports.js";

export const onRequest = createApiHandler({
  async POST(context) {
    const token = await requireSmsIngestAuthorization(
      context.request,
      context.env,
    );
    const body = await readSmsIngestJson(context.request);
    const input = parseSmsIngestPayload(body);

    const result = await ingestSmsImport(
      requireDb(context),
      context.env,
      input,
      token,
    );

    return success(result, result.duplicate ? 200 : 202);
  },
});
