import type { NextFunction, Request, Response } from "express";
import { QueryFailedError } from "typeorm";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError } from "../utils/appError";
import { errorResponse } from "../utils/response";

export function notFoundHandler(req: Request, res: Response) {
  res
    .status(404)
    .json(
      errorResponse(
        `Route not found: ${req.method} ${req.originalUrl}`,
        "NOT_FOUND"
      )
    );
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = req.requestId;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { requestId, stack: err.stack });
    } else {
      logger.warn(err.message, { requestId, statusCode: err.statusCode });
    }
    return res
      .status(err.statusCode)
      .json(errorResponse(err.message, err.code, err.details));
  }

  if (err instanceof QueryFailedError) {
    const dbErr = err as any;
    if (dbErr.code === "ER_DUP_ENTRY") {
      logger.warn(err.message, { requestId });
      return res
        .status(409)
        .json(
          errorResponse("A record with this value already exists", "CONFLICT")
        );
    }
    logger.error(err.message, { requestId, stack: err.stack });
    const detailMsg = !env.isProduction
      ? `Database query failed: ${err.message}`
      : "Database query failed";
    return res.status(500).json(errorResponse(detailMsg, "DB_ERROR"));
  }

  logger.error(err?.message ?? "Unexpected error", {
    requestId,
    stack: err?.stack,
  });
  const internalMsg = !env.isProduction
    ? (err?.message ?? "Internal server error")
    : "Internal server error";
  return res.status(500).json(errorResponse(internalMsg, "INTERNAL"));
}
