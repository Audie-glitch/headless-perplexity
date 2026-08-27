export class PerplexityError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, code = "PERPLEXITY_ERROR", status?: number, details?: unknown) {
    super(message);
    this.name = "PerplexityError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class AuthenticationError extends PerplexityError {
  constructor(message = "Perplexity rejected the session. Check the session token or Cloudflare clearance.", status = 403) {
    super(message, "AUTHENTICATION_ERROR", status);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends PerplexityError {
  constructor(message = "Perplexity rate-limited the request.") {
    super(message, "RATE_LIMIT", 429);
    this.name = "RateLimitError";
  }
}

export class ValidationError extends PerplexityError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

export class UpstreamError extends PerplexityError {
  constructor(message: string, status?: number, details?: unknown) {
    super(message, "UPSTREAM_ERROR", status, details);
    this.name = "UpstreamError";
  }
}

export function errorToPayload(error: unknown): {
  code: string;
  message: string;
  status?: number;
} {
  if (error instanceof PerplexityError) {
    return { code: error.code, message: error.message, status: error.status };
  }

  if (error instanceof Error) {
    return { code: "INTERNAL_ERROR", message: error.message, status: 500 };
  }

  return { code: "INTERNAL_ERROR", message: "Unknown error", status: 500 };
}
