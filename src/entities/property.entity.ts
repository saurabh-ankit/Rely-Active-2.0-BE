import { Column, Entity, Index, OneToMany } from "typeorm";

import { BaseEntity } from "./base.entity";
import { PropertyAssignee } from "./property-assignee.entity";
import { PropertyUnit } from "./property-unit.entity";

@Entity({ name: "properties" })
export class Property extends BaseEntity {
  @Index()
  @Column({ type: "varchar", name: "tenant_id", length: 36 })
  tenantId!: string;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "json", name: "property_type", nullable: true })
  propertyType!: string[];

  @Column({ type: "json", name: "property_sub_type", nullable: true })
  propertySubType?: string[];

  @Column({ type: "varchar", name: "developer_name", length: 255 })
  developerName!: string;

  @Column({ type: "varchar", name: "construction_status", length: 100 })
  constructionStatus!: string;

  @Column({ type: "date", name: "possession_date", nullable: true })
  possessionDate?: Date;

  @Column({ type: "varchar", name: "rera_number", length: 100, nullable: true })
  reraNumber?: string;

  @Column({ type: "varchar", length: 255 })
  address!: string;

  @Column({ type: "varchar", length: 100 })
  locality!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  landmark?: string;

  @Column({ type: "varchar", length: 100 })
  city!: string;

  @Column({ type: "varchar", length: 100 })
  state!: string;

  @Column({ type: "varchar", length: 100, default: "India" })
  country!: string;

  @Column({ type: "varchar", length: 20 })
  pincode!: string;

  @Column({ type: "decimal", precision: 10, scale: 8, nullable: true })
  latitude?: number;

  @Column({ type: "decimal", precision: 11, scale: 8, nullable: true })
  longitude?: number;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "boolean", name: "is_exclusive", default: false })
  isExclusive!: boolean;

  @Column({ type: "boolean", name: "is_featured", default: false })
  isFeatured!: boolean;

  @Column({ type: "json", name: "building_features", nullable: true })
  buildingFeatures?: string[];

  @Column({ type: "json", name: "amenities", nullable: true })
  amenities?: string[];

  @Column({ type: "json", name: "property_images", nullable: true })
  propertyImages?: string[];

  @Column({ type: "json", name: "bhk_configs", nullable: true })
  bhkConfigs?: any[];

  @Column({
    type: "varchar",
    name: "property_manager",
    length: 36,
    nullable: true,
  })
  propertyManager?: string;

  @Column({
    type: "enum",
    enum: ["ACTIVE", "INACTIVE", "MAINTENANCE"],
    default: "ACTIVE",
  })
  status!: "ACTIVE" | "INACTIVE" | "MAINTENANCE";

  @Column({ type: "boolean", name: "is_deleted", default: false })
  isDeleted!: boolean;

  @Column({ type: "varchar", name: "created_by", length: 36 })
  createdBy!: string;

  @OneToMany(() => PropertyUnit, unit => unit.property, { cascade: true })
  units!: PropertyUnit[];

  @OneToMany(() => PropertyAssignee, assignee => assignee.property, {
    cascade: true,
  })
  assignees!: PropertyAssignee[];
}
