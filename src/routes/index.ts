import { Router } from "express";

import { healthRouter } from "../modules/health/health.routes";

export const rootRouter = Router();

rootRouter.use(healthRouter);

// Mount feature routers under /api/v1 as they're built, e.g.:
//   import { facilityRouter } from "../modules/facilities/facility.routes";
//   const v1 = Router();
//   v1.use("/facilities", facilityRouter);
//   rootRouter.use("/api/v1", v1);
