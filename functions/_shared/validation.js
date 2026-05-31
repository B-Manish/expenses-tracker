import { z } from "zod";
import { isValidDateString, validateInclusiveDateRange } from "./dates.js";
import { errorResponse, validationError } from "./errors.js";
import { parseRupeesToPaise } from "./money.js";

function emptyToUndefined(value) {
  return value === "" || value === null ? undefined : value;
}

export const idSchema = z.coerce
  .number()
  .int("ID must be an integer")
  .positive("ID must be greater than 0");

export const dateSchema = z
  .string()
  .trim()
  .refine(isValidDateString, "Date must be a valid YYYY-MM-DD date");

export const amountPaiseSchema = z.union([z.string(), z.number()]).transform(
  (value, context) => {
    const result = parseRupeesToPaise(value);

    if (!result.ok) {
      context.addIssue({
        code: "custom",
        message: result.message,
      });

      return z.NEVER;
    }

    return result.paise;
  },
);

export const paginationSchema = z.object({
  limit: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int("Limit must be an integer")
      .min(1, "Limit must be at least 1")
      .max(100, "Limit must be at most 100")
      .default(50),
  ),
  offset: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int("Offset must be an integer")
      .min(0, "Offset must be at least 0")
      .default(0),
  ),
});

export function stringSchema(label, options = {}) {
  const { max = 255, required = true } = options;
  let schema = z.string().trim().max(max, `${label} must be ${max} characters or less`);

  if (required) {
    schema = schema.min(1, `${label} is required`);
  }

  return schema;
}

export function enumSchema(values, label = "Value") {
  return z.enum(values, {
    message: `${label} must be one of: ${values.join(", ")}`,
  });
}

export function dateRangeSchema() {
  return z
    .object({
      from: z.preprocess(emptyToUndefined, dateSchema.optional()),
      to: z.preprocess(emptyToUndefined, dateSchema.optional()),
    })
    .superRefine((value, context) => {
      const result = validateInclusiveDateRange(value.from, value.to);

      for (const issue of result.issues) {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
    });
}

export function validate(schema, input) {
  const result = schema.safeParse(input);

  if (result.success) {
    return {
      ok: true,
      data: result.data,
    };
  }

  const error = validationError(result.error.issues);

  return {
    ok: false,
    issues: result.error.issues,
    error,
    response: errorResponse(error),
  };
}

export function parseValidated(schema, input) {
  const result = validate(schema, input);

  if (!result.ok) {
    throw result.error;
  }

  return result.data;
}

