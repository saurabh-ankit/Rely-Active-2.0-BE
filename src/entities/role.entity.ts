import { Column, Entity, Index } from "typeorm";

import { BaseEntity } from "./base.entity";

@Entity({ name: "roles" })
@Index(["tenantId", "code"], { unique: true })
export class Role extends BaseEntity {
  @Column({ type: "varchar", name: "tenant_id", length: 36 })
  tenantId!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "varchar", length: 100 })
  code!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "json" })
  permissions!: string[];

  @Column({ type: "boolean", name: "is_system", default: false })
  isSystem!: boolean;
}
