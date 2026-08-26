import { Router } from "express";

import { authRouter } from "../modules/auth/auth.routes";
import { companyRouter } from "../modules/company/company.routes";
import { healthRouter } from "../modules/health/health.routes";
import { propertyRouter } from "../modules/property/property.routes";
import { userRouter } from "../modules/user/user.routes";

export const rootRouter = Router();

// Mount public health checks (no auth required)
rootRouter.use(healthRouter);

// Mount API v1 domain routes
const v1Router = Router();
v1Router.use("/auth", authRouter);
v1Router.use("/company", companyRouter);
v1Router.use("/properties", propertyRouter);
v1Router.use("/users", userRouter);

rootRouter.use("/api/v1", v1Router);
