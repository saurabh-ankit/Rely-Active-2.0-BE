import type { NextFunction, Request, Response } from "express";

import { AppError } from "../utils/appError";

export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userPermissions = req.userPermissions || [];

    // Allow platform_admin or active_admin full wildcards
    if (userPermissions.includes("*") || userPermissions.includes("admin.*")) {
      return next();
    }

    const hasPermission = requiredPermissions.every(perm =>
      userPermissions.includes(perm)
    );

    if (!hasPermission) {
      return next(
        AppError.forbidden(
          `Action requires explicit permission(s): [${requiredPermissions.join(", ")}]`
        )
      );
    }

    next();
  };
}
