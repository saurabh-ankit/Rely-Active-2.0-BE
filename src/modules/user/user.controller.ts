import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";

import { AppDataSource } from "../../config/db";
import { PlatformUser } from "../../entities/platform-user.entity";
import { PropertyAssignee } from "../../entities/property-assignee.entity";
import { Role } from "../../entities/role.entity";
import { AppError } from "../../utils/appError";

const DEFAULT_SYSTEM_ROLES = [
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

export class UserController {
  /**
   * List all database-driven roles for tenant (auto-seeds defaults if empty)
   */
  async getRoles(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId || "tenant_dev_001";
      const roleRepo = AppDataSource.getRepository(Role);

      let roles = await roleRepo.find({
        where: { tenantId },
        order: { isSystem: "DESC", name: "ASC" },
      });

      // Auto-seed system defaults if database table is empty for tenant
      if (roles.length === 0) {
        const createdRoles = DEFAULT_SYSTEM_ROLES.map(r =>
          roleRepo.create({
            tenantId,
            ...r,
          })
        );
        roles = await roleRepo.save(createdRoles);
      }

      res.status(200).json({
        status: "success",
        results: roles.length,
        data: roles,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create a custom dynamic role in the database
   */
  async createRole(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId || "tenant_dev_001";
      const { name, code, description, permissions } = req.body;

      if (!name || !code) {
        throw AppError.badRequest("Role Name and Role Code are required");
      }

      const roleRepo = AppDataSource.getRepository(Role);
      const normalizedCode = code.toUpperCase().replace(/\s+/g, "_");

      const existing = await roleRepo.findOne({
        where: { tenantId, code: normalizedCode },
      });
      if (existing) {
        throw AppError.conflict(
          `Role with code '${normalizedCode}' already exists`
        );
      }

      const newRole = roleRepo.create({
        tenantId,
        name,
        code: normalizedCode,
        description,
        permissions: Array.isArray(permissions)
          ? permissions
          : ["property.view"],
        isSystem: false,
      });

      const savedRole = await roleRepo.save(newRole);

      res.status(201).json({
        status: "success",
        message: "Dynamic role created successfully in database",
        data: savedRole,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * List onboarded staff/users within tenant
   */
  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId || "tenant_dev_001";
      const userRepo = AppDataSource.getRepository(PlatformUser);
      const assigneeRepo = AppDataSource.getRepository(PropertyAssignee);

      const users = await userRepo.find({
        where: { tenantId },
        order: { createdAt: "DESC" },
      });

      const usersWithAssignees = await Promise.all(
        users.map(async u => {
          const assignments = await assigneeRepo.find({
            where: { userId: u.id },
            relations: { property: true },
          });
          const { passwordHash: _, ...safeUser } = u;
          return {
            ...safeUser,
            assignedProperties: assignments.map(a => ({
              propertyId: a.propertyId,
              title: a.property?.title,
            })),
          };
        })
      );

      res.status(200).json({
        status: "success",
        results: usersWithAssignees.length,
        data: usersWithAssignees,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Onboard a new staff/admin user
   */
  async onboardUser(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId || "tenant_dev_001";
      const {
        fullName,
        email,
        phoneNumber,
        role,
        password,
        propertyIds,
        customPermissions,
      } = req.body;

      if (!fullName || !email || !role) {
        throw AppError.badRequest("Full Name, Email, and Role are required");
      }

      const userRepo = AppDataSource.getRepository(PlatformUser);
      const assigneeRepo = AppDataSource.getRepository(PropertyAssignee);
      const roleRepo = AppDataSource.getRepository(Role);

      // Check duplicate email
      const existing = await userRepo.findOne({ where: { email } });
      if (existing) {
        throw AppError.conflict(`User with email '${email}' already exists`);
      }

      // Hash password (default: Rely@123)
      const rawPassword = password || "Rely@123";
      const passwordHash = await bcrypt.hash(rawPassword, 10);

      // Look up role in DB to fetch exact assigned permissions
      const dbRole = await roleRepo.findOne({
        where: { tenantId, code: role },
      });
      const defaultPermissions = dbRole
        ? dbRole.permissions
        : ["property.view"];
      const permissions = Array.from(
        new Set([...defaultPermissions, ...(customPermissions || [])])
      );

      const newUser = userRepo.create({
        tenantId,
        fullName,
        email,
        phoneNumber,
        role,
        passwordHash,
        permissions,
        isActive: true,
      });

      const savedUser = await userRepo.save(newUser);

      // Assign property access scopes if provided
      if (Array.isArray(propertyIds) && propertyIds.length > 0) {
        const assignments = propertyIds.map((pId: string) =>
          assigneeRepo.create({
            tenantId,
            userId: savedUser.id,
            propertyId: pId,
            assignedBy: req.user?.userId || "SYSTEM",
            assignedAt: new Date(),
          })
        );
        await assigneeRepo.save(assignments);
      }

      const { passwordHash: _, ...safeUser } = savedUser;

      res.status(201).json({
        status: "success",
        message: "User onboarded successfully",
        data: safeUser,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update user status or assignments
   */
  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const targetUserId = Array.isArray(id) ? id[0] : id;
      const {
        fullName,
        phoneNumber,
        role,
        isActive,
        propertyIds,
        permissions,
      } = req.body;
      const userRepo = AppDataSource.getRepository(PlatformUser);
      const assigneeRepo = AppDataSource.getRepository(PropertyAssignee);

      const user = await userRepo.findOne({ where: { id: targetUserId } });
      if (!user) {
        throw AppError.notFound("User not found");
      }

      if (fullName !== undefined) user.fullName = fullName;
      if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
      if (role !== undefined) user.role = role;
      if (isActive !== undefined) user.isActive = isActive;
      if (permissions !== undefined) user.permissions = permissions;

      const updatedUser = await userRepo.save(user);

      if (Array.isArray(propertyIds)) {
        await assigneeRepo.delete({ userId: targetUserId });
        if (propertyIds.length > 0) {
          const assignments = propertyIds.map((pId: string) =>
            assigneeRepo.create({
              tenantId: user.tenantId || "tenant_dev_001",
              userId: targetUserId,
              propertyId: pId,
              assignedBy: req.user?.userId || "SYSTEM",
              assignedAt: new Date(),
            })
          );
          await assigneeRepo.save(assignments);
        }
      }

      const { passwordHash: _, ...safeUser } = updatedUser;

      res.status(200).json({
        status: "success",
        message: "User profile updated successfully",
        data: safeUser,
      });
    } catch (err) {
      next(err);
    }
  }
}
