import { requireDb } from "../../_shared/db.js";
import { createApiHandler } from "../../_shared/http.js";
import { success } from "../../_shared/json.js";
import {
  hasTransactionKeyword,
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

    if (!hasTransactionKeyword(input.message)) {
      return success({
        accepted: false,
        skipped: true,
        reason: "no_transaction_keyword",
      });
    }

    const result = await ingestSmsImport(
      requireDb(context),
      context.env,
      input,
      token,
    );

    return success(result, result.duplicate ? 200 : 202);
  },
});
