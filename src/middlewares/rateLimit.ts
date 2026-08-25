import rateLimit from "express-rate-limit";

import { env } from "../config/env";
import { errorResponse } from "../utils/response";

export const globalRateLimit = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(errorResponse("Too many requests", "TOO_MANY_REQUESTS"));
  },
});
