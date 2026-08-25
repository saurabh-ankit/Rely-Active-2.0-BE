import Redis from "ioredis";

import { env } from "./env";
import { logger } from "./logger";

// Lazy connect: nothing hits the network until the first command is issued,
// so importing this module has no side effects and it's safe to bring in
// from anywhere (future queues/cache) without affecting boot behavior.
export const redis = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  db: env.redis.db,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on("error", err => {
  logger.error("Redis connection error", {
    scope: "redis",
    error: err.message,
  });
});

export default redis;
