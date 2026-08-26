import { Column, Entity, Index, ManyToOne, JoinColumn } from "typeorm";

import { BaseEntity } from "./base.entity";
import { Property } from "./property.entity";

@Entity({ name: "property_units" })
@Index(["tenantId", "propertyId", "towerName", "unitNumber"], { unique: true })
export class PropertyUnit extends BaseEntity {
  @Column({ type: "varchar", name: "tenant_id", length: 36 })
  tenantId!: string;

  @Column({ type: "varchar", name: "property_id", length: 36 })
  propertyId!: string;

  @Column({ type: "varchar", name: "tower_name", length: 100 })
  towerName!: string;

  @Column({ type: "varchar", name: "unit_number", length: 50 })
  unitNumber!: string;

  @Column({ name: "floor_number", type: "int" })
  floorNumber!: number;

  @Column({
    name: "unit_type",
    type: "enum",
    enum: ["FLAT", "VILLA", "ROW_HOUSE", "PENTHOUSE", "STUDIO", "SENIOR_SUITE"],
    default: "FLAT",
  })
  unitType!:
    "FLAT" | "VILLA" | "ROW_HOUSE" | "PENTHOUSE" | "STUDIO" | "SENIOR_SUITE";

  @Column({
    name: "carpet_area_sqft",
    type: "decimal",
    precision: 10,
    scale: 2,
  })
  carpetAreaSqft!: number;

  @Column({ type: "varchar", length: 50, nullable: true })
  facing?: string;

  @Column({
    name: "occupancy_status",
    type: "enum",
    enum: ["VACANT", "RESERVED", "OCCUPIED", "UNDER_REPAIR"],
    default: "VACANT",
  })
  occupancyStatus!: "VACANT" | "RESERVED" | "OCCUPIED" | "UNDER_REPAIR";

  @Column({
    name: "base_monthly_rent",
    type: "decimal",
    precision: 12,
    scale: 2,
  })
  baseMonthlyRent!: number;

  @ManyToOne(() => Property, property => property.units, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "property_id" })
  property!: Property;
}
