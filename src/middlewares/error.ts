import type { NextFunction, Request, Response } from "express";
import { ValidationError as SequelizeValidationError } from "sequelize";

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

  if (err instanceof SequelizeValidationError) {
    logger.warn(err.message, { requestId });
    return res.status(400).json(
      errorResponse(
        "Database validation error",
        "DB_VALIDATION",
        err.errors.map(e => ({ path: e.path, message: e.message }))
      )
    );
  }

  if (err?.name === "SequelizeUniqueConstraintError") {
    logger.warn(err.message, { requestId });
    return res
      .status(409)
      .json(
        errorResponse("A record with this value already exists", "CONFLICT")
      );
  }

  logger.error(err?.message ?? "Unexpected error", {
    requestId,
    stack: err?.stack,
  });

  return res
    .status(500)
    .json(errorResponse("Internal server error", "INTERNAL"));
}
