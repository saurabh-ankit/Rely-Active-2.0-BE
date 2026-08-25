import { Sequelize } from "sequelize-typescript";

import { models } from "../models";

import { env } from "./env";
import { logger } from "./logger";

export const sequelize = new Sequelize({
  dialect: "mysql",
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  models,
  logging: env.isProduction
    ? false
    : (sql: string) => logger.debug(sql, { scope: "sequelize" }),
});

export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate();
  logger.info("Database connection established", { scope: "db" });
}

export default sequelize;
