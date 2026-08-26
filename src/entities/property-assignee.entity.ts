import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";

import { BaseEntity } from "./base.entity";
import { Property } from "./property.entity";

@Entity({ name: "property_assignees" })
@Index(["propertyId", "userId"], { unique: true })
export class PropertyAssignee extends BaseEntity {
  @Column({ type: "varchar", name: "tenant_id", length: 36 })
  tenantId!: string;

  @Column({ type: "varchar", name: "property_id", length: 36 })
  propertyId!: string;

  @Column({ type: "varchar", name: "user_id", length: 36 })
  userId!: string;

  @Column({ type: "varchar", name: "assigned_by", length: 36, nullable: true })
  assignedBy?: string;

  @Column({ name: "assigned_at", type: "datetime", nullable: true })
  assignedAt?: Date;

  @ManyToOne(() => Property, property => property.assignees, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "property_id" })
  property!: Property;
}
