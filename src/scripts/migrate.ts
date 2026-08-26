import "reflect-metadata";
import { AppDataSource } from "../config/db";

async function runMigrations() {
  const command = process.argv[2] || "up";

  await AppDataSource.initialize();

  if (command === "up") {
    const result = await AppDataSource.runMigrations({ transaction: "each" });
    console.log(`✅ ${result.length} migration(s) ran successfully`);
  } else if (command === "down") {
    await AppDataSource.undoLastMigration({ transaction: "each" });
    console.log("✅ Last migration reverted");
  } else if (command === "status") {
    const migrations = await AppDataSource.showMigrations();
    console.log("Pending migrations:", migrations);
  }

  await AppDataSource.destroy();
}

runMigrations().catch(err => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
