import { Router } from "express";

import { authenticateToken } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { resolveTenant } from "../../middlewares/tenant";

import { UserController } from "./user.controller";

export const userRouter = Router();
const controller = new UserController();

// GET /api/v1/users/roles — Get RBAC role definitions from DB
userRouter.get("/roles", authenticateToken, resolveTenant, controller.getRoles);

// POST /api/v1/users/roles — Create a custom dynamic role in DB
userRouter.post(
  "/roles",
  authenticateToken,
  resolveTenant,
  requirePermission("user.manage"),
  controller.createRole
);

// GET /api/v1/users — List onboarded users
userRouter.get(
  "/",
  authenticateToken,
  resolveTenant,
  requirePermission("user.view"),
  controller.getUsers
);

// POST /api/v1/users — Onboard new user / staff
userRouter.post(
  "/",
  authenticateToken,
  resolveTenant,
  requirePermission("user.manage"),
  controller.onboardUser
);

// PATCH /api/v1/users/:id — Update user details or property assignments
userRouter.patch(
  "/:id",
  authenticateToken,
  resolveTenant,
  requirePermission("user.manage"),
  controller.updateUser
);
