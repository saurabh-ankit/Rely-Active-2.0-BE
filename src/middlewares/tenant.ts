import type { NextFunction, Request, Response } from "express";

import { AppError } from "../utils/appError";

export function resolveTenant(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.tenantId) {
    return next(
      AppError.tenantIsolation(
        "Tenant context missing from authenticated request"
      )
    );
  }

  // Cross-check header tenant claim if explicitly passed by client
  const headerTenantId = req.headers["x-tenant-id"] as string;
  if (headerTenantId && headerTenantId !== req.tenantId) {
    return next(
      AppError.tenantIsolation(
        "Tenant claim mismatch between token and request headers"
      )
    );
  }

  next();
}
