import { AppDataSource } from "../../config/db";
import { PropertyUnit } from "../../entities/property-unit.entity";
import { Property } from "../../entities/property.entity";
import { AppError } from "../../utils/appError";

const propertyRepo = () => AppDataSource.getRepository(Property);
const unitRepo = () => AppDataSource.getRepository(PropertyUnit);

export class PropertyService {
  public async createProperty(
    tenantId: string,
    createdBy: string,
    data: Partial<Property>
  ): Promise<Property> {
    const property = propertyRepo().create({
      ...(data as object),
      tenantId,
      createdBy,
    } as Property);
    return await propertyRepo().save(property);
  }

  public async getPropertiesByTenant(tenantId: string): Promise<Property[]> {
    return await propertyRepo().find({
      where: { tenantId, isDeleted: false },
      relations: { units: true },
      order: { createdAt: "DESC" },
    });
  }

  public async getPropertyById(
    tenantId: string,
    propertyId: string
  ): Promise<Property> {
    const property = await propertyRepo().findOne({
      where: { id: propertyId, tenantId, isDeleted: false },
      relations: { units: true, assignees: true },
    });
    if (!property) {
      throw AppError.notFound(`Property [${propertyId}] not found`);
    }
    return property;
  }

  public async createUnit(
    tenantId: string,
    propertyId: string,
    unitData: Partial<PropertyUnit>
  ): Promise<PropertyUnit> {
    await this.getPropertyById(tenantId, propertyId);
    const unit = unitRepo().create({
      ...(unitData as object),
      tenantId,
      propertyId,
    } as PropertyUnit);
    return await unitRepo().save(unit);
  }

  public async createBulkUnits(
    tenantId: string,
    propertyId: string,
    unitsList: Partial<PropertyUnit>[]
  ): Promise<PropertyUnit[]> {
    await this.getPropertyById(tenantId, propertyId);
    const units = unitsList.map(u =>
      unitRepo().create({
        ...(u as object),
        tenantId,
        propertyId,
      } as PropertyUnit)
    );
    return await unitRepo().save(units);
  }

  public async getDashboardStats(tenantId: string, propertyId?: string) {
    const properties = await this.getPropertiesByTenant(tenantId);

    let filteredProperties = properties;
    if (propertyId && propertyId !== "ALL") {
      filteredProperties = properties.filter(p => p.id === propertyId);
    }

    const allUnits = filteredProperties.flatMap(p => p.units || []);

    const totalProperties = filteredProperties.length;
    const totalUnits = allUnits.length;
    const occupiedUnits = allUnits.filter(
      u => u.occupancyStatus === "OCCUPIED"
    ).length;
    const vacantUnits = allUnits.filter(
      u => u.occupancyStatus === "VACANT"
    ).length;
    const reservedUnits = allUnits.filter(
      u => u.occupancyStatus === "RESERVED"
    ).length;
    const underRepairUnits = allUnits.filter(
      u => u.occupancyStatus === "UNDER_REPAIR"
    ).length;

    const occupancyRate =
      totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    return {
      scope:
        propertyId && propertyId !== "ALL"
          ? "SINGLE_LOCATION"
          : "ALL_LOCATIONS",
      selectedPropertyId: propertyId || "ALL",
      metrics: {
        totalProperties,
        totalUnits,
        occupiedUnits,
        vacantUnits,
        reservedUnits,
        underRepairUnits,
        occupancyRate,
        activeResidents: occupiedUnits * 1.2, // mock metric for residents
        careTasksToday: totalUnits > 0 ? Math.round(totalUnits * 0.4) : 0,
        pendingInvoices: Math.round(occupiedUnits * 0.3),
      },
      propertyBreakdown: properties.map(p => ({
        id: p.id,
        title: p.title,
        locality: p.locality,
        city: p.city,
        totalUnits: (p.units || []).length,
        occupiedUnits: (p.units || []).filter(
          u => u.occupancyStatus === "OCCUPIED"
        ).length,
      })),
    };
  }
}
