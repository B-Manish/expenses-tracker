const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

function createHeaders(headers) {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", JSON_CONTENT_TYPE);
  }

  return responseHeaders;
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: createHeaders(headers),
  });
}

export function success(data = {}, status = 200, headers = {}) {
  return json({ success: true, data }, status, headers);
}

export function failure(message, status = 500, headers = {}) {
  return json(
    {
      success: false,
      error: {
        message,
      },
    },
    status,
    headers,
  );
}

export function methodNotAllowed(allowedMethods) {
  return failure("Method not allowed", 405, {
    Allow: allowedMethods.join(", "),
  });
}
