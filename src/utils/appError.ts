export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    options?: { code?: string; details?: unknown }
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = options?.code;
    this.details = options?.details;

    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, message, { code: "BAD_REQUEST", details });
  }

  static unauthorized(message = "Unauthorized"): AppError {
    return new AppError(401, message, { code: "UNAUTHORIZED" });
  }

  static forbidden(message = "Forbidden"): AppError {
    return new AppError(403, message, { code: "FORBIDDEN" });
  }

  static notFound(message = "Not found"): AppError {
    return new AppError(404, message, { code: "NOT_FOUND" });
  }

  static conflict(message: string): AppError {
    return new AppError(409, message, { code: "CONFLICT" });
  }

  static unprocessable(message: string, details?: unknown): AppError {
    return new AppError(422, message, { code: "UNPROCESSABLE", details });
  }

  static tooMany(message = "Too many requests"): AppError {
    return new AppError(429, message, { code: "TOO_MANY_REQUESTS" });
  }

  static internal(message = "Internal server error"): AppError {
    return new AppError(500, message, { code: "INTERNAL" });
  }

  static tenantIsolation(
    message = "Cross-tenant access violation detected"
  ): AppError {
    return new AppError(403, message, { code: "TENANT_VIOLATION" });
  }
}
