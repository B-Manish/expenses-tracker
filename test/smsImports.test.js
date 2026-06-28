import assert from "node:assert/strict";
import test from "node:test";
import { onRequest as handleSmsIngest } from "../functions/api/sms-imports/ingest.js";
import {
  createSmsMessageHash,
  hasTransactionKeyword,
  parseBankSms,
  parseSmsIngestPayload,
} from "../functions/_shared/smsImports.js";

const TOKEN = "test-sms-ingest-token-with-at-least-32-characters";

class MemorySmsDb {
  constructor() {
    this.rows = [];
  }

  prepare(sql) {
    const db = this;

    return {
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async run() {
        if (!sql.includes("INSERT OR IGNORE INTO sms_imports")) {
          throw new Error("Unexpected test query");
        }

        const [
          userId,
          deviceId,
          sender,
          rawMessage,
          messageHash,
          direction,
          suggestedType,
          amountPaise,
          currency,
          transactionAt,
          transactionDate,
          transactionTime,
          accountSuffix,
          bankReference,
          merchant,
          paymentRail,
          parserVersion,
        ] = this.values;
        const existing = db.rows.find(
          (row) =>
            row.user_id === userId && row.message_hash === messageHash,
        );

        if (existing) {
          return { meta: { changes: 0 } };
        }

        const id = db.rows.length + 1;

        db.rows.push({
          id,
          user_id: userId,
          device_id: deviceId,
          sender,
          raw_message: rawMessage,
          message_hash: messageHash,
          direction,
          suggested_type: suggestedType,
          amount_paise: amountPaise,
          currency,
          transaction_at: transactionAt,
          transaction_date: transactionDate,
          transaction_time: transactionTime,
          account_suffix: accountSuffix,
          bank_reference: bankReference,
          merchant,
          payment_rail: paymentRail,
          parser_version: parserVersion,
          status: "PENDING",
        });

        return { meta: { changes: 1, last_row_id: id } };
      },
      async first() {
        if (!sql.includes("FROM sms_imports")) {
          throw new Error("Unexpected test query");
        }

        const [userId, messageHash] = this.values;

        return (
          db.rows.find(
            (row) =>
              row.user_id === userId && row.message_hash === messageHash,
          ) ?? null
        );
      },
    };
  }
}

function smsRequest(body, token = TOKEN) {
  return new Request("https://tracker.example/api/sms-imports/ingest", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("parses a UPI debit SMS", () => {
  const parsed = parseBankSms({
    sender: "HDFCBK",
    message:
      "Rs.450.00 debited from A/c XX1234 via UPI to SWIGGY. Ref 123456789012.",
    receivedAt: "2026-06-28T20:15:00+05:30",
  });

  assert.deepEqual(parsed, {
    sender: "HDFCBK",
    direction: "DEBIT",
    suggestedType: "EXPENSE",
    amountPaise: 45000,
    currency: "INR",
    transactionAt: "2026-06-28T14:45:00.000Z",
    transactionDate: "2026-06-28",
    transactionTime: "20:15",
    accountSuffix: "1234",
    reference: "123456789012",
    merchant: "SWIGGY",
    paymentRail: "UPI",
  });
});

test("parses comma-separated credit amounts and income metadata", () => {
  const parsed = parseBankSms({
    sender: "AXISBK",
    message:
      "INR 1,25,000.00 credited to account XX9876 by ACME PAYROLL on 28-Jun. Ref No SALARY12345.",
    receivedAt: "2026-06-28T09:00:00+05:30",
  });

  assert.equal(parsed.direction, "CREDIT");
  assert.equal(parsed.suggestedType, "INCOME");
  assert.equal(parsed.amountPaise, 12500000);
  assert.equal(parsed.accountSuffix, "9876");
  assert.equal(parsed.reference, "SALARY12345");
  assert.equal(parsed.merchant, "ACME PAYROLL");
});

test("rejects messages that do not describe a supported transaction", () => {
  assert.throws(
    () =>
      parseBankSms({
        sender: "BANK",
        message: "Your monthly statement is now available.",
      }),
    /debit or credit transaction/,
  );
});

test("accepts a transaction keyword when no supported INR amount is present", () => {
  const parsed = parseBankSms({
    sender: "BANK",
    message: "Your account has been debited. Check the banking app for details.",
  });

  assert.equal(parsed.direction, "DEBIT");
  assert.equal(parsed.suggestedType, "EXPENSE");
  assert.equal(parsed.amountPaise, null);
});

test("matches only complete debit and credit transaction keywords", () => {
  for (const message of [
    "Rs.10 debit from your account",
    "Rs.10 DEBITED from your account",
    "Rs.10 credit to your account",
    "Rs.10 Credited to your account",
  ]) {
    assert.equal(hasTransactionKeyword(message), true);
  }

  assert.equal(hasTransactionKeyword("Your monthly statement is ready."), false);
  assert.equal(hasTransactionKeyword("Your card was accredited."), false);
});

test("ingestion validation preserves the original sender and complete message", () => {
  const input = {
    sender: "  HdfcBk  ",
    message:
      "  Rs.450.00 debited from A/c XX1234.\nAvailable balance: Rs.1,000.00.  ",
  };

  assert.deepEqual(parseSmsIngestPayload(input), input);
});

test("message hashes are stable but keyed by the ingestion token", async () => {
  const first = await createSmsMessageHash(TOKEN, "HDFCBK", "Rs.10 debited");
  const repeated = await createSmsMessageHash(
    TOKEN,
    " hdfcbk ",
    "  Rs.10   debited ",
  );
  const otherKey = await createSmsMessageHash(
    `${TOKEN}-different`,
    "HDFCBK",
    "Rs.10 debited",
  );

  assert.equal(first, repeated);
  assert.notEqual(first, otherKey);
});

test("endpoint authenticates, inserts once, and reports replayed messages", async () => {
  const db = new MemorySmsDb();
  const env = { DB: db, SMS_INGEST_TOKEN: TOKEN };
  const body = {
    sender: "HDFCBK",
    message:
      "  Rs.450.00 debited from A/c XX1234 via UPI to SWIGGY.\nRef 123456789012.  ",
  };

  const createdResponse = await handleSmsIngest({
    request: smsRequest(body),
    env,
  });
  const created = await createdResponse.json();

  assert.equal(createdResponse.status, 202);
  assert.equal(created.success, true);
  assert.equal(created.data.accepted, true);
  assert.equal(created.data.duplicate, false);
  assert.equal(created.data.importId, 1);
  assert.equal(created.data.import.id, 1);
  assert.equal(db.rows.length, 1);
  assert.equal(Object.hasOwn(db.rows[0], "message"), false);
  assert.equal(db.rows[0].raw_message, body.message);

  const replayResponse = await handleSmsIngest({
    request: smsRequest(body),
    env,
  });
  const replay = await replayResponse.json();

  assert.equal(replayResponse.status, 200);
  assert.equal(replay.data.duplicate, true);
  assert.equal(replay.data.import.id, 1);
  assert.equal(db.rows.length, 1);
});

test("endpoint safely skips messages without a transaction keyword", async () => {
  const response = await handleSmsIngest({
    request: smsRequest({
      sender: "BANK",
      message: "Your monthly statement is now available.",
    }),
    env: { SMS_INGEST_TOKEN: TOKEN },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    success: true,
    data: {
      accepted: false,
      skipped: true,
      reason: "no_transaction_keyword",
    },
  });
});

test("endpoint accepts keyword messages without a supported INR amount", async () => {
  const db = new MemorySmsDb();
  const response = await handleSmsIngest({
    request: smsRequest({
      sender: "BANK",
      message: "Your account has been credited. Open the app for details.",
    }),
    env: { DB: db, SMS_INGEST_TOKEN: TOKEN },
  });
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(body.success, true);
  assert.equal(body.data.accepted, true);
  assert.equal(body.data.import.amountPaise, null);
  assert.equal(db.rows[0].amount_paise, null);
});

test("endpoint rejects invalid bearer tokens before reading a valid payload", async () => {
  const response = await handleSmsIngest({
    request: smsRequest(
      {
        sender: "HDFCBK",
        message: "Rs.10 debited from account XX1234.",
      },
      "wrong-token",
    ),
    env: { DB: new MemorySmsDb(), SMS_INGEST_TOKEN: TOKEN },
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.equal(body.success, false);
});

test("endpoint rejects client-supplied timestamps", async () => {
  const response = await handleSmsIngest({
    request: smsRequest({
      sender: "HDFCBK",
      message: "Rs.10 debited from account XX1234.",
      receivedAt: "2026-06-28T20:15:00+05:30",
    }),
    env: { DB: new MemorySmsDb(), SMS_INGEST_TOKEN: TOKEN },
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error.message, /Unrecognized key/);
});
