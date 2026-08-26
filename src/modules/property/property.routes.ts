import { Router } from "express";

import { authenticateToken } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { resolveTenant } from "../../middlewares/tenant";

import { PropertyController } from "./property.controller";

export const propertyRouter = Router();
const controller = new PropertyController();

propertyRouter.post(
  "/",
  authenticateToken,
  resolveTenant,
  requirePermission("property.create"),
  controller.createProperty
);

propertyRouter.get(
  "/",
  authenticateToken,
  resolveTenant,
  requirePermission("property.view"),
  controller.getProperties
);

propertyRouter.get(
  "/stats/dashboard",
  authenticateToken,
  resolveTenant,
  requirePermission("property.view"),
  controller.getDashboardStats
);

propertyRouter.get(
  "/:id",
  authenticateToken,
  resolveTenant,
  requirePermission("property.view"),
  controller.getPropertyById
);

propertyRouter.post(
  "/:id/units",
  authenticateToken,
  resolveTenant,
  requirePermission("property.update"),
  controller.addUnit
);

propertyRouter.post(
  "/:id/units/bulk",
  authenticateToken,
  resolveTenant,
  requirePermission("property.update"),
  controller.addBulkUnits
);
