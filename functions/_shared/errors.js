import { failure } from "./json.js";

export const HTTP_STATUS = Object.freeze({
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
});

const SUPPORTED_ERROR_STATUSES = new Set(Object.values(HTTP_STATUS));

const DEFAULT_MESSAGES = {
  [HTTP_STATUS.BAD_REQUEST]: "Bad request",
  [HTTP_STATUS.UNAUTHORIZED]: "Authentication required",
  [HTTP_STATUS.FORBIDDEN]: "Forbidden",
  [HTTP_STATUS.NOT_FOUND]: "Not found",
  [HTTP_STATUS.METHOD_NOT_ALLOWED]: "Method not allowed",
  [HTTP_STATUS.CONFLICT]: "Conflict",
  [HTTP_STATUS.TOO_MANY_REQUESTS]: "Too many requests",
  [HTTP_STATUS.INTERNAL_SERVER_ERROR]: "Internal server error",
};

export class ApiError extends Error {
  constructor(status, message = DEFAULT_MESSAGES[status], options = {}) {
    const normalizedStatus = normalizeStatus(status);

    super(message || DEFAULT_MESSAGES[normalizedStatus]);

    this.name = "ApiError";
    this.status = normalizedStatus;
    this.publicMessage = options.publicMessage || this.message;
    this.expose = options.expose ?? normalizedStatus < 500;
    this.headers = options.headers || {};
    this.issues = options.issues || [];
  }
}

function normalizeStatus(status) {
  return SUPPORTED_ERROR_STATUSES.has(status)
    ? status
    : HTTP_STATUS.INTERNAL_SERVER_ERROR;
}

function getEnv(contextOrEnv) {
  if (contextOrEnv?.env) {
    return contextOrEnv.env;
  }

  return contextOrEnv;
}

export function isProductionEnv(contextOrEnv) {
  const env = getEnv(contextOrEnv);
  const environment = env?.ENVIRONMENT || env?.NODE_ENV;

  return environment === "production";
}

export function isDevelopmentEnv(contextOrEnv) {
  const env = getEnv(contextOrEnv);
  const environment = env?.ENVIRONMENT || env?.NODE_ENV;

  return environment === "development" || environment === "local";
}

export function httpError(status, message, options = {}) {
  return new ApiError(status, message, options);
}

export function badRequest(message = DEFAULT_MESSAGES[400], options = {}) {
  return httpError(HTTP_STATUS.BAD_REQUEST, message, options);
}

export function unauthorized(message = DEFAULT_MESSAGES[401], options = {}) {
  return httpError(HTTP_STATUS.UNAUTHORIZED, message, options);
}

export function forbidden(message = DEFAULT_MESSAGES[403], options = {}) {
  return httpError(HTTP_STATUS.FORBIDDEN, message, options);
}

export function notFound(message = DEFAULT_MESSAGES[404], options = {}) {
  return httpError(HTTP_STATUS.NOT_FOUND, message, options);
}

export function methodNotAllowedError(allowedMethods = []) {
  return httpError(
    HTTP_STATUS.METHOD_NOT_ALLOWED,
    DEFAULT_MESSAGES[HTTP_STATUS.METHOD_NOT_ALLOWED],
    {
      headers: {
        Allow: allowedMethods.join(", "),
      },
    },
  );
}

export function conflict(message = DEFAULT_MESSAGES[409], options = {}) {
  return httpError(HTTP_STATUS.CONFLICT, message, options);
}

export function tooManyRequests(
  message = DEFAULT_MESSAGES[429],
  options = {},
) {
  return httpError(HTTP_STATUS.TOO_MANY_REQUESTS, message, options);
}

export function internalServerError(
  message = DEFAULT_MESSAGES[500],
  options = {},
) {
  return httpError(HTTP_STATUS.INTERNAL_SERVER_ERROR, message, options);
}

export function formatValidationIssues(issues = []) {
  return issues
    .map((issue) => {
      const path = issue.path?.length ? issue.path.join(".") : "value";

      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function validationError(issues) {
  const message = formatValidationIssues(issues);

  return badRequest(message ? `Validation failed: ${message}` : "Validation failed", {
    issues,
  });
}

function getStatus(error) {
  if (error instanceof ApiError) {
    return error.status;
  }

  if (SUPPORTED_ERROR_STATUSES.has(error?.status)) {
    return error.status;
  }

  return HTTP_STATUS.INTERNAL_SERVER_ERROR;
}

function getPublicMessage(error, contextOrEnv) {
  const status = getStatus(error);

  if (error instanceof ApiError) {
    if (status >= 500 && !error.expose && !isDevelopmentEnv(contextOrEnv)) {
      return DEFAULT_MESSAGES[HTTP_STATUS.INTERNAL_SERVER_ERROR];
    }

    return error.publicMessage || DEFAULT_MESSAGES[status];
  }

  if (status >= 500) {
    return isDevelopmentEnv(contextOrEnv)
      ? error?.message || DEFAULT_MESSAGES[HTTP_STATUS.INTERNAL_SERVER_ERROR]
      : DEFAULT_MESSAGES[HTTP_STATUS.INTERNAL_SERVER_ERROR];
  }

  return error?.message || DEFAULT_MESSAGES[status];
}

function getHeaders(error) {
  if (error instanceof ApiError) {
    return error.headers;
  }

  return error?.headers || {};
}

export function errorResponse(error, contextOrEnv) {
  const status = getStatus(error);
  const message = getPublicMessage(error, contextOrEnv);

  return failure(message, status, getHeaders(error));
}
