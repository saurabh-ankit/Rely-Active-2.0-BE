import { Column, Entity, Index } from "typeorm";

import { BaseEntity } from "./base.entity";

@Entity({ name: "company_profiles" })
export class CompanyProfile extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: "varchar", name: "tenant_id", length: 36 })
  tenantId!: string;

  @Column({ type: "varchar", name: "company_name", length: 255 })
  companyName!: string;

  @Column({
    type: "varchar",
    name: "registration_number",
    length: 100,
    nullable: true,
  })
  registrationNumber?: string;

  @Column({ type: "varchar", name: "support_email", length: 255 })
  supportEmail!: string;

  @Column({ type: "varchar", name: "support_phone", length: 50 })
  supportPhone!: string;

  @Column({
    type: "varchar",
    name: "time_zone",
    length: 100,
    default: "Asia/Kolkata",
  })
  timeZone!: string;

  @Column({
    type: "varchar",
    name: "currency_code",
    length: 10,
    default: "INR",
  })
  currencyCode!: string;

  @Column({ type: "varchar", name: "logo_url", length: 512, nullable: true })
  logoUrl?: string;

  @Column({
    type: "enum",
    enum: ["ACTIVE", "SUSPENDED", "OFFBOARDED"],
    default: "ACTIVE",
  })
  status!: "ACTIVE" | "SUSPENDED" | "OFFBOARDED";
}
