import { z } from "zod";
import {
  badRequest,
  internalServerError,
  unauthorized,
} from "./errors.js";
import { parseRupeesToPaise } from "./money.js";
import { parseValidated } from "./validation.js";

export const MAX_SMS_INGEST_BYTES = 8 * 1024;
export const SMS_PARSER_VERSION = "bank-sms-v1";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TRANSACTION_KEYWORD_PATTERN = /\b(?:debit(?:ed)?|credit(?:ed)?)\b/i;
const DEFAULT_SMS_USER_ID = "phone:9949055750";
const smsIngestSchema = z
  .object({
    sender: z
      .string()
      .max(64, "Sender must be 64 characters or less")
      .refine((value) => value.trim().length > 0, "Sender is required"),
    message: z
      .string()
      .max(4096, "Message must be 4096 characters or less")
      .refine((value) => value.trim().length > 0, "Message is required"),
  })
  .strict();

function bytesToHex(bytes) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(first, second) {
  if (first.byteLength !== second.byteLength) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < first.byteLength; index += 1) {
    difference |= first[index] ^ second[index];
  }

  return difference === 0;
}

async function sha256(value) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
}

function requireConfiguredToken(env) {
  const token = env?.SMS_INGEST_TOKEN;

  if (typeof token !== "string" || token.length < 32) {
    throw internalServerError("SMS ingestion is not configured", {
      expose: true,
      publicMessage: "SMS ingestion is not configured",
    });
  }

  return token;
}

export async function requireSmsIngestAuthorization(request, env) {
  const configuredToken = requireConfiguredToken(env);
  const authorization = request.headers.get("authorization") ?? "";
  const presentedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (
    !presentedToken ||
    presentedToken.length > 512 ||
    !constantTimeEqual(
      await sha256(presentedToken),
      await sha256(configuredToken),
    )
  ) {
    throw unauthorized("Invalid SMS ingestion token", {
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }

  return configuredToken;
}

export async function readSmsIngestJson(request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw badRequest("Content-Type must be application/json");
  }

  const declaredLength = Number(request.headers.get("content-length"));

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_SMS_INGEST_BYTES
  ) {
    throw badRequest("SMS ingestion request is too large");
  }

  const bytes = new Uint8Array(await request.arrayBuffer());

  if (bytes.byteLength === 0) {
    throw badRequest("Request body is required");
  }

  if (bytes.byteLength > MAX_SMS_INGEST_BYTES) {
    throw badRequest("SMS ingestion request is too large");
  }

  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}

export function parseSmsIngestPayload(input) {
  return parseValidated(smsIngestSchema, input);
}

export function hasTransactionKeyword(message) {
  return (
    typeof message === "string" && TRANSACTION_KEYWORD_PATTERN.test(message)
  );
}

function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}

function findDirection(message) {
  const debit = /\b(?:debited|debit|spent|withdrawn|paid|purchase|used)\b/i.exec(
    message,
  );
  const credit =
    /\b(?:credited|credit|received|deposited|refund(?:ed)?)\b/i.exec(message);

  if (!debit && !credit) {
    throw badRequest("SMS does not identify a debit or credit transaction");
  }

  if (debit && credit) {
    return debit.index < credit.index ? "DEBIT" : "CREDIT";
  }

  return debit ? "DEBIT" : "CREDIT";
}

function findAmountPaise(message) {
  const match =
    /(?:₹|(?:INR|RS)\.?)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i.exec(message);

  if (!match) {
    return null;
  }

  const result = parseRupeesToPaise(match[1].replaceAll(",", ""));

  if (!result.ok) {
    return null;
  }

  return result.paise;
}

function findAccountSuffix(message) {
  const match =
    /(?:a\/c|acct|account|card)(?:\s*(?:no\.?|number|ending))?[\s:*#-]*(?:x{2,}|\*{2,})?([0-9]{3,6})\b/i.exec(
      message,
    );

  return match?.[1] ?? null;
}

function findReference(message) {
  const match =
    /\b(?:upi\s+ref|utr|ref(?:erence)?(?:\s*(?:no|number|id))?|txn(?:\s*(?:no|number|id))?|transaction\s+id)[\s:#-]*([a-z0-9][a-z0-9-]{5,39})/i.exec(
      message,
    );

  return match?.[1]?.replace(/[.,;:]$/, "") ?? null;
}

function findPaymentRail(message) {
  const rails = [
    "UPI",
    "IMPS",
    "NEFT",
    "RTGS",
    "NACH",
    "ACH",
    "ECS",
    "ATM",
    "POS",
    "CARD",
  ];

  return (
    rails.find((rail) => new RegExp(`\\b${rail}\\b`, "i").test(message)) ??
    "UNKNOWN"
  );
}

function cleanMerchant(value) {
  if (!value) {
    return null;
  }

  const cleaned = normalizeWhitespace(value)
    .replace(/^(?:vpa|merchant)\s*[:#-]?\s*/i, "")
    .replace(/\s+(?:using|through)$/i, "")
    .slice(0, 120)
    .trim();

  if (!cleaned || /^(?:a\/c|acct|account|card)\b/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function findMerchant(message, direction) {
  const boundary =
    "(?=\\s+(?:on|via|ref|utr|txn|avl|available|balance)\\b|[.;]|$)";
  const keyword = direction === "DEBIT" ? "to|at" : "from|by";
  const matches = [
    ...message.matchAll(new RegExp(`\\b(?:${keyword})\\s+(.+?)${boundary}`, "gi")),
  ];

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const merchant = cleanMerchant(matches[index][1]);

    if (merchant) {
      return merchant;
    }
  }

  return null;
}

function normalizeReceivedAt(receivedAt, now) {
  const date = receivedAt ? new Date(receivedAt) : new Date(now);

  if (!Number.isFinite(date.getTime())) {
    throw badRequest("Received time is invalid");
  }

  const kolkata = new Date(date.getTime() + 330 * 60 * 1000);
  const kolkataIso = kolkata.toISOString();

  return {
    transactionAt: date.toISOString(),
    transactionDate: kolkataIso.slice(0, 10),
    transactionTime: kolkataIso.slice(11, 16),
  };
}

export function parseBankSms(input, options = {}) {
  const message = normalizeWhitespace(input.message);
  const direction = findDirection(message);
  const timestamp = normalizeReceivedAt(
    input.receivedAt,
    options.now ?? new Date(),
  );

  return {
    sender: normalizeWhitespace(input.sender).toUpperCase(),
    direction,
    suggestedType: direction === "DEBIT" ? "EXPENSE" : "INCOME",
    amountPaise: findAmountPaise(message),
    currency: "INR",
    ...timestamp,
    accountSuffix: findAccountSuffix(message),
    reference: findReference(message),
    merchant: findMerchant(message, direction),
    paymentRail: findPaymentRail(message),
  };
}

export async function createSmsMessageHash(token, sender, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const normalized = `${normalizeWhitespace(sender).toUpperCase()}\n${normalizeWhitespace(message)}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(normalized),
  );

  return bytesToHex(new Uint8Array(signature));
}

function mapSmsImport(row) {
  return {
    id: row.id,
    status: row.status,
    sender: row.sender,
    direction: row.direction,
    suggestedType: row.suggested_type,
    amountPaise: row.amount_paise,
    currency: row.currency,
    transactionAt: row.transaction_at,
    transactionDate: row.transaction_date,
    transactionTime: row.transaction_time,
    accountSuffix: row.account_suffix,
    reference: row.bank_reference,
    merchant: row.merchant,
    paymentRail: row.payment_rail,
  };
}

async function getSmsImportByHash(db, userId, messageHash) {
  return db
    .prepare(`
      SELECT *
      FROM sms_imports
      WHERE user_id = ? AND message_hash = ?
    `)
    .bind(userId, messageHash)
    .first();
}

function normalizeEnvironmentIdentifier(value, fallback) {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value.trim())
  ) {
    return fallback;
  }

  return value.trim();
}

function createSmsTransactionTitle(smsImport) {
  const merchant = smsImport.merchant?.trim();

  if (merchant) {
    return merchant.slice(0, 120);
  }

  return `SMS transaction from ${smsImport.sender}`.slice(0, 120);
}

function getSmsPaymentMethodName(paymentRail) {
  if (paymentRail === "UPI") {
    return "UPI";
  }

  if (["IMPS", "NEFT", "RTGS", "NACH", "ACH", "ECS"].includes(paymentRail)) {
    return "Net Banking";
  }

  return null;
}

async function createTransactionFromSmsImport(db, smsImport) {
  const categoryName =
    smsImport.suggested_type === "EXPENSE" ? "Other Expense" : "Other Income";

  await db
    .prepare(`
      INSERT OR IGNORE INTO transactions (
        user_id,
        type,
        title,
        amount_paise,
        category_id,
        payment_method_id,
        transaction_date,
        transaction_time,
        merchant,
        notes,
        source,
        sms_import_id
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        (SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ? LIMIT 1),
        (SELECT id FROM payment_methods WHERE user_id = ? AND name = ? LIMIT 1),
        ?,
        ?,
        ?,
        NULL,
        'SMS',
        ?
      )
    `)
    .bind(
      smsImport.user_id,
      smsImport.suggested_type,
      createSmsTransactionTitle(smsImport),
      smsImport.amount_paise,
      smsImport.user_id,
      categoryName,
      smsImport.suggested_type,
      smsImport.user_id,
      getSmsPaymentMethodName(smsImport.payment_rail),
      smsImport.transaction_date,
      smsImport.transaction_time,
      smsImport.merchant,
      smsImport.id,
    )
    .run();
}

export async function ingestSmsImport(db, env, input, token, options = {}) {
  const parsed = parseBankSms(
    {
      sender: input.sender,
      message: input.message,
    },
    options,
  );
  const userId = normalizeEnvironmentIdentifier(
    env?.SMS_INGEST_USER_ID,
    DEFAULT_SMS_USER_ID,
  );
  const deviceId = normalizeEnvironmentIdentifier(
    env?.SMS_INGEST_DEVICE_ID,
    "iphone-shortcuts",
  );
  const messageHash = await createSmsMessageHash(
    token,
    input.sender,
    input.message,
  );
  const result = await db
    .prepare(`
      INSERT OR IGNORE INTO sms_imports (
        user_id,
        device_id,
        sender,
        raw_message,
        message_hash,
        direction,
        suggested_type,
        amount_paise,
        currency,
        transaction_at,
        transaction_date,
        transaction_time,
        account_suffix,
        bank_reference,
        merchant,
        payment_rail,
        parser_version
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      userId,
      deviceId,
      parsed.sender,
      input.message,
      messageHash,
      parsed.direction,
      parsed.suggestedType,
      parsed.amountPaise,
      parsed.currency,
      parsed.transactionAt,
      parsed.transactionDate,
      parsed.transactionTime,
      parsed.accountSuffix,
      parsed.reference,
      parsed.merchant,
      parsed.paymentRail,
      SMS_PARSER_VERSION,
    )
    .run();
  const row = await getSmsImportByHash(db, userId, messageHash);

  if (!row) {
    throw internalServerError("SMS import could not be stored");
  }

  await createTransactionFromSmsImport(db, row);

  return {
    accepted: true,
    duplicate: result.meta?.changes !== 1,
    importId: row.id,
    import: mapSmsImport(row),
  };
}
