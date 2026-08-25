import { createApp } from "./app";
import { connectDatabase, sequelize } from "./config/db";
import { env } from "./config/env";
import { logger } from "./config/logger";

async function main() {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`🚀 Rely Active API listening on port ${env.port}`, {
      scope: "bootstrap",
      env: env.nodeEnv,
    });
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`, {
      scope: "bootstrap",
    });

    server.close(async () => {
      try {
        await sequelize.close();
        logger.info("Shutdown complete", { scope: "bootstrap" });
        process.exit(0);
      } catch (err) {
        logger.error("Error during shutdown", { scope: "bootstrap", err });
        process.exit(1);
      }
    });

    // Force-exit if connections don't drain in time.
    setTimeout(() => {
      logger.error("Forced shutdown after timeout", { scope: "bootstrap" });
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch(err => {
   
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});
