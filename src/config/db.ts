import "reflect-metadata";
import { DataSource } from "typeorm";

import { CompanyProfile } from "../entities/company-profile.entity";
import { PlatformUser } from "../entities/platform-user.entity";
import { PropertyAssignee } from "../entities/property-assignee.entity";
import { PropertyUnit } from "../entities/property-unit.entity";
import { Property } from "../entities/property.entity";
import { Role } from "../entities/role.entity";

import { env } from "./env";

export const AppDataSource = new DataSource({
  type: "mysql",
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  synchronize: false, // NEVER true in production - use migrations
  logging: !env.isProduction,
  entities: [
    CompanyProfile,
    PlatformUser,
    Property,
    PropertyAssignee,
    PropertyUnit,
    Role,
  ],
  migrations: ["src/migrations/*.ts"],
  migrationsTableName: "typeorm_migrations",
});

export async function connectDatabase(): Promise<void> {
  await AppDataSource.initialize();
}
