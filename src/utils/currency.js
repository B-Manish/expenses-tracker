const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export const MAX_TRANSACTION_AMOUNT_PAISE = 10000000000;

const AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function formatCurrencyFromPaise(amountPaise) {
  const paise = Number(amountPaise ?? 0);
  const safePaise = Number.isFinite(paise) ? paise : 0;

  return inrFormatter.format(safePaise / 100);
}

export function formatSignedCurrencyFromPaise(amountPaise) {
  const value = Number(amountPaise ?? 0);

  if (value > 0) {
    return `+${formatCurrencyFromPaise(value)}`;
  }

  return formatCurrencyFromPaise(value);
}

export function paiseToRupeesInputValue(amountPaise) {
  const paise = Number(amountPaise ?? 0);

  if (!Number.isSafeInteger(paise) || paise <= 0) {
    return "";
  }

  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;

  if (remainder === 0) {
    return String(rupees);
  }

  return `${rupees}.${String(remainder).padStart(2, "0")}`;
}

export function isAmountInput(value) {
  return AMOUNT_PATTERN.test(value || "") && Number(value) > 0;
}

export function parseRupeesToPaiseInput(input) {
  if (typeof input !== "string") {
    return {
      ok: false,
      message: "Amount is required.",
    };
  }

  const value = input.trim();

  if (!value) {
    return {
      ok: false,
      message: "Amount is required.",
    };
  }

  if (value.includes(",")) {
    return {
      ok: false,
      message: "Enter the amount without commas.",
    };
  }

  if (!AMOUNT_PATTERN.test(value)) {
    return {
      ok: false,
      message: "Amount must be greater than 0 with up to 2 decimal places.",
    };
  }

  const [rupeesPart, paisePart = ""] = value.split(".");
  const paise = BigInt(rupeesPart) * 100n + BigInt(paisePart.padEnd(2, "0") || "0");

  if (paise <= 0n) {
    return {
      ok: false,
      message: "Amount must be greater than 0.",
    };
  }

  if (paise > BigInt(MAX_TRANSACTION_AMOUNT_PAISE)) {
    return {
      ok: false,
      message: "Amount is too large.",
    };
  }

  return {
    ok: true,
    paise: Number(paise),
  };
}
