import { Router } from "express";

import { AuthController } from "./auth.controller";

export const authRouter = Router();
const controller = new AuthController();

// POST /api/v1/auth/login
authRouter.post("/login", controller.login);

// POST /api/v1/auth/seed-superadmin — ONLY in development, seeds first superadmin user
authRouter.post("/seed-superadmin", controller.seedSuperAdmin);
