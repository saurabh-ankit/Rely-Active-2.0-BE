import { Router } from "express";

import { AppDataSource } from "../../config/db";

export const healthRouter = Router();

healthRouter.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

healthRouter.get("/readyz", async (_req, res) => {
  try {
    await AppDataSource.query("SELECT 1");
    res.status(200).json({ status: "ok", db: "up" });
  } catch {
    res.status(503).json({ status: "unavailable", db: "down" });
  }
});
