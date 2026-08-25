import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middlewares/error";
import { httpLogger } from "./middlewares/httpLogger";
import { globalRateLimit } from "./middlewares/rateLimit";
import { requestContext } from "./middlewares/requestContext";
import { rootRouter } from "./routes";

/**
 * Pure app factory — no `listen()`, no process-level side effects. Keeping
 * this separate from src/index.ts means the app can be mounted in a test
 * runner (supertest or similar) with zero refactoring later.
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestContext);
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(httpLogger);
  app.use(globalRateLimit);

  app.use(rootRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
