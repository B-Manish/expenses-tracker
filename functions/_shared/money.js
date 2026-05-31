import { badRequest } from "./errors.js";

export const MAX_AMOUNT_PAISE = 10000000000;

const AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function parseRupeesToPaise(input, options = {}) {
  const maxPaise = options.maxPaise ?? MAX_AMOUNT_PAISE;
  const rawValue = typeof input === "number" ? String(input) : input;

  if (typeof rawValue !== "string") {
    return {
      ok: false,
      message: "Amount must be a string or number",
    };
  }

  const value = rawValue.trim();

  if (!value) {
    return {
      ok: false,
      message: "Amount is required",
    };
  }

  if (value.includes(",")) {
    return {
      ok: false,
      message: "Amount must not include commas",
    };
  }

  if (!AMOUNT_PATTERN.test(value)) {
    return {
      ok: false,
      message: "Amount must be greater than 0 with up to 2 decimal places",
    };
  }

  const [rupeesPart, paisePart = ""] = value.split(".");
  const paiseText = paisePart.padEnd(2, "0");
  const paise = BigInt(rupeesPart) * 100n + BigInt(paiseText || "0");

  if (paise <= 0n) {
    return {
      ok: false,
      message: "Amount must be greater than 0",
    };
  }

  if (paise > BigInt(maxPaise)) {
    return {
      ok: false,
      message: "Amount is too large",
    };
  }

  return {
    ok: true,
    paise: Number(paise),
  };
}

export function assertRupeesToPaise(input, options = {}) {
  const result = parseRupeesToPaise(input, options);

  if (!result.ok) {
    throw badRequest(result.message);
  }

  return result.paise;
}

export function paiseToRupeesString(amountPaise) {
  if (!Number.isSafeInteger(amountPaise)) {
    throw badRequest("Amount paise must be a safe integer");
  }

  const sign = amountPaise < 0 ? "-" : "";
  const absolute = Math.abs(amountPaise);
  const rupees = Math.floor(absolute / 100);
  const paise = String(absolute % 100).padStart(2, "0");

  return `${sign}${rupees}.${paise}`;
}

