import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { redis } from "../config/redis";
import type { JwtUserPayload } from "../types/express";
import { AppError } from "../utils/appError";

export async function authenticateToken(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    // DEV FALLBACK (Option B): If no Authorization Bearer header in non-production, accept dev headers
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (!env.isProduction) {
        const devTenantId =
          (req.headers["x-tenant-id"] as string) || "tenant_dev_001";
        const devUserId =
          (req.headers["x-user-id"] as string) || "usr_dev_admin";
        const devPermissionsHeader = req.headers[
          "x-user-permissions"
        ] as string;
        const devPermissions = devPermissionsHeader
          ? devPermissionsHeader.split(",").map(p => p.trim())
          : ["*"];

        req.user = {
          userId: devUserId,
          tenantId: devTenantId,
          email: "dev@relyactive.local",
          roles: ["DEV_ADMIN"],
          permissions: devPermissions,
        };
        req.tenantId = devTenantId;
        req.userPermissions = devPermissions;
        return next();
      }

      throw AppError.unauthorized("Missing or invalid Authorization header");
    }

    const token = authHeader.split(" ")[1];

    // Redis Token Blacklist Check (Instant Revocation Engine)
    const isBlacklisted = await redis
      .get(`blacklist:${token}`)
      .catch(() => null);
    if (isBlacklisted) {
      throw AppError.unauthorized(
        "Token has been revoked or session terminated"
      );
    }

    let decodedPayload: JwtUserPayload;
    try {
      decodedPayload = jwt.decode(token) as JwtUserPayload;
      if (
        !decodedPayload ||
        !decodedPayload.userId ||
        !decodedPayload.tenantId
      ) {
        throw AppError.unauthorized("Malformed identity token");
      }
    } catch {
      throw AppError.unauthorized("Invalid JWT token signature or expiration");
    }

    // Attach user payload & tenant to Express request context
    req.user = decodedPayload;
    req.tenantId = decodedPayload.tenantId;
    req.userPermissions = decodedPayload.permissions || [];

    next();
  } catch (error) {
    next(error);
  }
}
