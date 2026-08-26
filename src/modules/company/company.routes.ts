import { Router } from "express";

import { authenticateToken } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { resolveTenant } from "../../middlewares/tenant";

import { CompanyController } from "./company.controller";

export const companyRouter = Router();
const controller = new CompanyController();

companyRouter.get(
  "/setup-status",
  authenticateToken,
  resolveTenant,
  controller.checkSetupStatus
);

companyRouter.get(
  "/profile",
  authenticateToken,
  resolveTenant,
  requirePermission("company.profile.view"),
  controller.getProfile
);

companyRouter.patch(
  "/profile",
  authenticateToken,
  resolveTenant,
  requirePermission("company.profile.manage"),
  controller.updateProfile
);
