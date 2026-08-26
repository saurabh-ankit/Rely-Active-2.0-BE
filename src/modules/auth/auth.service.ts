import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { AppDataSource } from "../../config/db";
import { env } from "../../config/env";
import { PlatformUser } from "../../entities/platform-user.entity";
import { AppError } from "../../utils/appError";

const repo = () => AppDataSource.getRepository(PlatformUser);

export class AuthService {
  public async login(
    email: string,
    password: string
  ): Promise<{ token: string; user: Partial<PlatformUser> }> {
    const user = await repo().findOne({ where: { email, isActive: true } });

    if (!user) {
      throw AppError.unauthorized("Invalid email or password");
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw AppError.unauthorized("Invalid email or password");
    }

    // Update last login timestamp
    await repo().update(user.id, { lastLoginAt: new Date() });

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId || `tenant_${user.id.slice(0, 8)}`,
      roles: [user.role],
      permissions: user.permissions,
    };

    const token = jwt.sign(tokenPayload, env.jwt.secret, {
      expiresIn: env.jwt.expiresIn as any,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        permissions: user.permissions,
      },
    };
  }

  public async createSuperAdmin(data: {
    email: string;
    password: string;
    fullName: string;
  }): Promise<PlatformUser> {
    const existing = await repo().count({ where: { email: data.email } });
    if (existing > 0) {
      throw AppError.conflict("A user with this email already exists");
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = repo().create({
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      role: "SUPERADMIN",
      permissions: ["*"],
      isActive: true,
    });

    return await repo().save(user);
  }
}
