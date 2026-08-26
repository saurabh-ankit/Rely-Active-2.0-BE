import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1724620000000 implements MigrationInterface {
  name = "InitSchema1724620000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`platform_users\` (
        \`id\` varchar(36) NOT NULL,
        \`email\` varchar(255) NOT NULL,
        \`password_hash\` varchar(255) NOT NULL,
        \`tenant_id\` varchar(36) NULL,
        \`full_name\` varchar(255) NOT NULL,
        \`phone_number\` varchar(50) NULL,
        \`role\` enum('SUPERADMIN','TENANT_ADMIN','PROPERTY_MANAGER','CARETAKER','SECURITY_GUARD','ACCOUNTANT','FAMILY_MEMBER') NOT NULL DEFAULT 'TENANT_ADMIN',
        \`permissions\` json NOT NULL DEFAULT ('[]'),
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`last_login_at\` datetime NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_platform_users_email\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`company_profiles\` (
        \`id\` varchar(36) NOT NULL,
        \`tenant_id\` varchar(36) NOT NULL,
        \`company_name\` varchar(255) NOT NULL,
        \`registration_number\` varchar(100) NULL,
        \`support_email\` varchar(255) NOT NULL,
        \`support_phone\` varchar(50) NOT NULL,
        \`time_zone\` varchar(100) NOT NULL DEFAULT 'Asia/Kolkata',
        \`currency_code\` varchar(10) NOT NULL DEFAULT 'INR',
        \`logo_url\` varchar(512) NULL,
        \`status\` enum('ACTIVE','SUSPENDED','OFFBOARDED') NOT NULL DEFAULT 'ACTIVE',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_company_profiles_tenant_id\` (\`tenant_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`properties\` (
        \`id\` varchar(36) NOT NULL,
        \`tenant_id\` varchar(36) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`property_type\` json NULL,
        \`property_sub_type\` json NULL,
        \`developer_name\` varchar(255) NOT NULL,
        \`construction_status\` varchar(100) NOT NULL,
        \`possession_date\` date NULL,
        \`rera_number\` varchar(100) NULL,
        \`address\` varchar(255) NOT NULL,
        \`locality\` varchar(100) NOT NULL,
        \`landmark\` varchar(100) NULL,
        \`city\` varchar(100) NOT NULL,
        \`state\` varchar(100) NOT NULL,
        \`country\` varchar(100) NOT NULL DEFAULT 'India',
        \`pincode\` varchar(20) NOT NULL,
        \`latitude\` decimal(10,8) NULL,
        \`longitude\` decimal(11,8) NULL,
        \`description\` text NULL,
        \`is_exclusive\` tinyint NOT NULL DEFAULT 0,
        \`is_featured\` tinyint NOT NULL DEFAULT 0,
        \`building_features\` json NULL,
        \`amenities\` json NULL,
        \`property_images\` json NULL,
        \`bhk_configs\` json NULL,
        \`property_manager\` varchar(36) NULL,
        \`status\` enum('ACTIVE','INACTIVE','MAINTENANCE') NOT NULL DEFAULT 'ACTIVE',
        \`is_deleted\` tinyint NOT NULL DEFAULT 0,
        \`created_by\` varchar(36) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_properties_tenant_id\` (\`tenant_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`property_units\` (
        \`id\` varchar(36) NOT NULL,
        \`tenant_id\` varchar(36) NOT NULL,
        \`property_id\` varchar(36) NOT NULL,
        \`tower_name\` varchar(100) NOT NULL,
        \`unit_number\` varchar(50) NOT NULL,
        \`floor_number\` int NOT NULL,
        \`unit_type\` enum('FLAT','VILLA','ROW_HOUSE','PENTHOUSE','STUDIO','SENIOR_SUITE') NOT NULL DEFAULT 'FLAT',
        \`carpet_area_sqft\` decimal(10,2) NOT NULL,
        \`facing\` varchar(50) NULL,
        \`occupancy_status\` enum('VACANT','RESERVED','OCCUPIED','UNDER_REPAIR') NOT NULL DEFAULT 'VACANT',
        \`base_monthly_rent\` decimal(12,2) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_property_units_unique\` (\`tenant_id\`, \`property_id\`, \`tower_name\`, \`unit_number\`),
        CONSTRAINT \`FK_property_units_property_id\` FOREIGN KEY (\`property_id\`) REFERENCES \`properties\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`property_assignees\` (
        \`id\` varchar(36) NOT NULL,
        \`tenant_id\` varchar(36) NOT NULL,
        \`property_id\` varchar(36) NOT NULL,
        \`user_id\` varchar(36) NOT NULL,
        \`assigned_by\` varchar(36) NULL,
        \`assigned_at\` datetime NULL DEFAULT CURRENT_TIMESTAMP,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_property_assignees_property_user\` (\`property_id\`, \`user_id\`),
        CONSTRAINT \`FK_property_assignees_property_id\` FOREIGN KEY (\`property_id\`) REFERENCES \`properties\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `property_assignees`");
    await queryRunner.query("DROP TABLE IF EXISTS `property_units`");
    await queryRunner.query("DROP TABLE IF EXISTS `properties`");
    await queryRunner.query("DROP TABLE IF EXISTS `company_profiles`");
    await queryRunner.query("DROP TABLE IF EXISTS `platform_users`");
  }
}
