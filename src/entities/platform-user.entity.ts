import { Column, Entity, Index } from "typeorm";

import { BaseEntity } from "./base.entity";

export type UserRole =
  | "SUPERADMIN"
  | "TENANT_ADMIN"
  | "PROPERTY_MANAGER"
  | "CARETAKER"
  | "SECURITY_GUARD"
  | "ACCOUNTANT"
  | "FAMILY_MEMBER";

@Entity({ name: "platform_users" })
export class PlatformUser extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({ type: "varchar", name: "password_hash", length: 255 })
  passwordHash!: string;

  @Column({ type: "varchar", name: "tenant_id", length: 36, nullable: true })
  tenantId?: string;

  @Column({ type: "varchar", name: "full_name", length: 255 })
  fullName!: string;

  @Column({ type: "varchar", name: "phone_number", length: 50, nullable: true })
  phoneNumber?: string;

  @Column({
    type: "varchar",
    length: 100,
    default: "PROPERTY_MANAGER",
  })
  role!: string;

  @Column({ type: "json", default: () => "('[]')" })
  permissions!: string[];

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;

  @Column({ name: "last_login_at", type: "datetime", nullable: true })
  lastLoginAt?: Date;
}
