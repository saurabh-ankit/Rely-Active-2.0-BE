import "reflect-metadata";
import bcrypt from "bcryptjs";

import { AppDataSource } from "../config/db";
import { PlatformUser } from "../entities/platform-user.entity";
import { Role } from "../entities/role.entity";

async function seed() {
  await AppDataSource.initialize();
  const tenantId = "tenant_dev_001";
  const userRepo = AppDataSource.getRepository(PlatformUser);
  const roleRepo = AppDataSource.getRepository(Role);

  // 1. Seed Dynamic DB Roles
  const defaultRoles = [
    {
      name: "Super Administrator",
      code: "SUPERADMIN",
      description:
        "Full global access across all enterprise locations and platform features.",
      permissions: ["*"],
      isSystem: true,
    },
    {
      name: "Tenant Administrator",
      code: "TENANT_ADMIN",
      description:
        "Full operational and administrative management within the organization.",
      permissions: [
        "company.profile.view",
        "company.profile.manage",
        "property.create",
        "property.view",
        "property.update",
        "user.manage",
        "user.view",
        "resident.manage",
        "billing.manage",
      ],
      isSystem: true,
    },
    {
      name: "Facility / Property Manager",
      code: "PROPERTY_MANAGER",
      description:
        "Manages assigned property facilities, room occupancy, and daily operations.",
      permissions: [
        "property.view",
        "property.update",
        "user.view",
        "resident.manage",
        "roster.manage",
        "billing.view",
      ],
      isSystem: true,
    },
    {
      name: "Caregiver / Support Staff",
      code: "CARETAKER",
      description:
        "Responsible for daily resident care tasks, activities, and shift logs.",
      permissions: [
        "property.view",
        "resident.view",
        "care.task.execute",
        "roster.view",
      ],
      isSystem: true,
    },
    {
      name: "Security & Visitor Staff",
      code: "SECURITY_GUARD",
      description:
        "Manages gate access, visitor entry logs, and facility security.",
      permissions: ["visitor.manage", "property.view"],
      isSystem: true,
    },
    {
      name: "Billing & Finance Admin",
      code: "ACCOUNTANT",
      description:
        "Manages resident invoicing, rent collection, and demand letters.",
      permissions: [
        "billing.manage",
        "billing.view",
        "property.view",
        "resident.view",
      ],
      isSystem: true,
    },
  ];

  for (const r of defaultRoles) {
    const existingRole = await roleRepo.findOne({
      where: { tenantId, code: r.code },
    });
    if (!existingRole) {
      const createdRole = roleRepo.create({ tenantId, ...r });
      await roleRepo.save(createdRole);
      console.log(`✅ Seeded DB Role: ${r.name} (${r.code})`);
    }
  }

  // 2. Seed Demo Staff Users
  const demoUsers = [
    {
      email: "admin@relyactive.com",
      fullName: "Super Admin",
      role: "SUPERADMIN",
      password: "admin123",
      permissions: ["*"],
    },
    {
      email: "manager@sunriise.com",
      fullName: "Rajesh Sharma",
      role: "PROPERTY_MANAGER",
      password: "Rely@123",
      permissions: [
        "property.view",
        "property.update",
        "user.view",
        "resident.manage",
        "roster.manage",
      ],
    },
    {
      email: "nurse.priya@sunriise.com",
      fullName: "Priya Nair (Lead Caregiver)",
      role: "CARETAKER",
      password: "Rely@123",
      permissions: [
        "property.view",
        "resident.view",
        "care.task.execute",
        "roster.view",
      ],
    },
    {
      email: "billing@sunriise.com",
      fullName: "Anand Verma (Finance)",
      role: "ACCOUNTANT",
      password: "Rely@123",
      permissions: [
        "billing.manage",
        "billing.view",
        "property.view",
        "resident.view",
      ],
    },
  ];

  for (const u of demoUsers) {
    const existing = await userRepo.findOne({ where: { email: u.email } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      const user = userRepo.create({
        email: u.email,
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        tenantId,
        permissions: u.permissions,
        isActive: true,
      });
      await userRepo.save(user);
      console.log(`✅ Seeded Staff User: ${u.email} (${u.role})`);
    }
  }

  await AppDataSource.destroy();
}

seed().catch(err => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
