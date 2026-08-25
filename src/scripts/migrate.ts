#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { SequelizeStorage, Umzug } from "umzug";

import { sequelize } from "../config/db";

const umzug = new Umzug({
  migrations: {
    glob: path.join(__dirname, "../migrations/*.ts"),
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: "sequelize_meta" }),
  logger: console,
});

async function main() {
  const command = process.argv[2] ?? "up";

  await sequelize.authenticate();

  switch (command) {
    case "up": {
      const pending = await umzug.pending();
      if (pending.length === 0) {
        console.log("✅ No pending migrations");
        break;
      }
      console.log(`🚀 Running ${pending.length} migration(s)...`);
      const executed = await umzug.up();
      executed.forEach(m => console.log(`  ✓ ${m.name}`));
      break;
    }

    case "down": {
      const executed = await umzug.down();
      executed.forEach(m => console.log(`  ↩ reverted ${m.name}`));
      break;
    }

    case "status": {
      const executed = await umzug.executed();
      const pending = await umzug.pending();
      console.log(`\n✅ Executed (${executed.length}):`);
      executed.forEach(m => console.log(`  ✓ ${m.name}`));
      console.log(`\n⏳ Pending (${pending.length}):`);
      pending.forEach(m => console.log(`  - ${m.name}`));
      break;
    }

    case "create": {
      const name = process.argv[3];
      if (!name) {
        console.error("Usage: npm run migrate:create <migration-name>");
        process.exit(1);
      }
      const migrationsDir = path.join(__dirname, "../migrations");
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "")
        .replace("T", "");
      const filename = `${timestamp}-${name}.ts`;
      const filepath = path.join(migrationsDir, filename);
      const template = `import { DataTypes, QueryInterface } from "sequelize";

export const up = async ({ context: queryInterface }: { context: QueryInterface }) => {
  // TODO: implement
};

export const down = async ({ context: queryInterface }: { context: QueryInterface }) => {
  // TODO: implement
};
`;
      fs.writeFileSync(filepath, template);
      console.log(`✅ Created ${filepath}`);
      break;
    }

    default:
      console.log("Usage: migrate.ts [up|down|status|create <name>]");
  }

  await sequelize.close();
}

main().catch(err => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
