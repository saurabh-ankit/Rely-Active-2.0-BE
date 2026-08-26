import "reflect-metadata";
import { AppDataSource } from "../config/db";

async function syncSchema() {
  await AppDataSource.initialize();
  console.log("🔄 Syncing DB schema for Roles table...");
  await AppDataSource.synchronize();
  console.log("✅ DB schema synchronized successfully!");
  await AppDataSource.destroy();
}

syncSchema().catch(err => {
  console.error("❌ Schema sync failed:", err);
  process.exit(1);
});
