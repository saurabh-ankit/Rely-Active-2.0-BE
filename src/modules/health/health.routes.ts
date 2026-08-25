import { Router } from "express";

import { sequelize } from "../../config/db";

export const healthRouter = Router();

// Liveness: process is up, no dependency checks. Used by the orchestrator to
// decide whether to restart the container.
healthRouter.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Readiness: can this instance actually serve traffic right now. Used to
// gate load balancer routing.
healthRouter.get("/readyz", async (_req, res) => {
  try {
    await sequelize.query("SELECT 1");
    res.status(200).json({ status: "ok", db: "up" });
  } catch {
    res.status(503).json({ status: "unavailable", db: "down" });
  }
});
