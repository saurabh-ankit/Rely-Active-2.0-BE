import "reflect-metadata";
import { AppDataSource } from "../config/db";
import { PlatformUser } from "../entities/platform-user.entity";
import { PropertyAssignee } from "../entities/property-assignee.entity";
import { PropertyUnit } from "../entities/property-unit.entity";
import { Property } from "../entities/property.entity";

async function seedProperties() {
  await AppDataSource.initialize();
  const targetTenants = ["tenant_dev_001", "tenant_demo_001"];
  const propertyRepo = AppDataSource.getRepository(Property);
  const unitRepo = AppDataSource.getRepository(PropertyUnit);
  const assigneeRepo = AppDataSource.getRepository(PropertyAssignee);
  const userRepo = AppDataSource.getRepository(PlatformUser);

  console.log(
    "🧹 Wiping ALL legacy / duplicate properties from database across all tenants..."
  );
  // Clear ALL assignees, units, and properties in database
  await assigneeRepo.createQueryBuilder().delete().execute();
  await unitRepo.createQueryBuilder().delete().execute();
  await propertyRepo.createQueryBuilder().delete().execute();

  // Fetch admin user for createdBy reference
  const adminUser = await userRepo.findOne({
    where: { email: "admin@relyactive.com" },
  });
  const adminId = adminUser ? adminUser.id : "SYSTEM";

  const realisticProperties = [
    {
      title: "Sunrise Senior Haven",
      propertyType: ["SENIOR_LIVING", "ASSISTED_CARE"],
      propertySubType: ["RETIREMENT_COMMUNITY"],
      developerName: "Rely Healthcare Infrastructure",
      constructionStatus: "READY_TO_MOVE",
      reraNumber: "RERA/HYD/2024/091",
      address: "Plot 45, Financial District, Gachibowli",
      locality: "Gachibowli",
      landmark: "Near Wipro Circle",
      city: "Hyderabad",
      state: "Telangana",
      country: "India",
      pincode: "500032",
      description:
        "Premier senior living community featuring 24/7 medical supervision, dining hall, and hydrotherapy center.",
      buildingFeatures: [
        "24/7 ICU Bay",
        "Physiotherapy Room",
        "Wheelchair Access Ramp",
        "Centralized Dining",
      ],
      amenities: [
        "Emergency Pull Cords",
        "CCTV Monitoring",
        "Library & Lounge",
        "Daily Doctor Visits",
      ],
      status: "ACTIVE" as const,
      units: [
        {
          towerName: "Tower A (Orchid)",
          unitNumber: "Flat 101",
          floorNumber: 1,
          unitType: "SENIOR_SUITE" as const,
          carpetAreaSqft: 850,
          facing: "East Facing",
          occupancyStatus: "OCCUPIED" as const,
          baseMonthlyRent: 35000,
        },
        {
          towerName: "Tower A (Orchid)",
          unitNumber: "Flat 102",
          floorNumber: 1,
          unitType: "STUDIO" as const,
          carpetAreaSqft: 650,
          facing: "North Facing",
          occupancyStatus: "VACANT" as const,
          baseMonthlyRent: 28000,
        },
        {
          towerName: "Tower B (Jasmine)",
          unitNumber: "Flat 201",
          floorNumber: 2,
          unitType: "SENIOR_SUITE" as const,
          carpetAreaSqft: 1200,
          facing: "North-East Facing",
          occupancyStatus: "RESERVED" as const,
          baseMonthlyRent: 48000,
        },
        {
          towerName: "Villa Cluster West",
          unitNumber: "Villa 05",
          floorNumber: 0,
          unitType: "VILLA" as const,
          carpetAreaSqft: 1500,
          facing: "East Facing",
          occupancyStatus: "VACANT" as const,
          baseMonthlyRent: 65000,
        },
      ],
    },
    {
      title: "Rely Care Enclave",
      propertyType: ["MEMORY_CARE", "ASSISTED_LIVING"],
      propertySubType: ["WELLNESS_CENTER"],
      developerName: "Rely Wellness Living",
      constructionStatus: "READY_TO_MOVE",
      reraNumber: "RERA/BLR/2024/412",
      address: "ITPL Main Road, Whitefield",
      locality: "Whitefield",
      landmark: "Opposite Forum Value Mall",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      pincode: "560066",
      description:
        "State-of-the-art assisted care facility with memory support units, organic garden, and round-the-clock nursing care.",
      buildingFeatures: [
        "Anti-Slip Flooring",
        "Grab Bars in All Restrooms",
        "High-Speed Elevators",
        "Ambulance On Standby",
      ],
      amenities: [
        "Nutritional Dietician",
        "Yoga Deck",
        "Memory Care Pavilion",
        "24/7 Security",
      ],
      status: "ACTIVE" as const,
      units: [
        {
          towerName: "Orchid Wing",
          unitNumber: "Suite 301",
          floorNumber: 3,
          unitType: "SENIOR_SUITE" as const,
          carpetAreaSqft: 750,
          facing: "North Facing",
          occupancyStatus: "OCCUPIED" as const,
          baseMonthlyRent: 32000,
        },
        {
          towerName: "Orchid Wing",
          unitNumber: "Suite 302",
          floorNumber: 3,
          unitType: "STUDIO" as const,
          carpetAreaSqft: 600,
          facing: "East Facing",
          occupancyStatus: "VACANT" as const,
          baseMonthlyRent: 26000,
        },
        {
          towerName: "Sky Tower",
          unitNumber: "Penthouse 01",
          floorNumber: 12,
          unitType: "PENTHOUSE" as const,
          carpetAreaSqft: 2200,
          facing: "South-East Facing",
          occupancyStatus: "VACANT" as const,
          baseMonthlyRent: 95000,
        },
      ],
    },
    {
      title: "Aura Senior Living & Wellness",
      propertyType: ["INDEPENDENT_LIVING"],
      propertySubType: ["LUXURY_RETIREMENT"],
      developerName: "Aura Lifecare Properties",
      constructionStatus: "READY_TO_MOVE",
      reraNumber: "RERA/PNQ/2025/118",
      address: "Koregaon Park Annex, Mundhwa",
      locality: "Koregaon Park",
      landmark: "Near Osho Ashram",
      city: "Pune",
      state: "Maharashtra",
      country: "India",
      pincode: "411001",
      description:
        "Boutique senior retirement residence with lush green gardens, concierge service, and wellness clinic.",
      buildingFeatures: [
        "Solar Heated Water",
        "Clubhouse",
        "Meditation Park",
        "Concierge Desk",
      ],
      amenities: [
        "Spa & Wellness Center",
        "Organic Cafe",
        "Daily Housekeeping",
        "Weekly Excursions",
      ],
      status: "ACTIVE" as const,
      units: [
        {
          towerName: "Healing Wing",
          unitNumber: "Room 105",
          floorNumber: 1,
          unitType: "SENIOR_SUITE" as const,
          carpetAreaSqft: 700,
          facing: "East Facing",
          occupancyStatus: "OCCUPIED" as const,
          baseMonthlyRent: 34000,
        },
        {
          towerName: "Healing Wing",
          unitNumber: "Room 106",
          floorNumber: 1,
          unitType: "STUDIO" as const,
          carpetAreaSqft: 550,
          facing: "North Facing",
          occupancyStatus: "UNDER_REPAIR" as const,
          baseMonthlyRent: 25000,
        },
      ],
    },
  ];

  for (const tenantId of targetTenants) {
    console.log(`\n📌 Seeding tenant: ${tenantId}`);
    for (const propData of realisticProperties) {
      const { units, ...pDetails } = propData;
      const property = propertyRepo.create({
        tenantId,
        createdBy: adminId,
        ...pDetails,
      });

      const savedProperty = await propertyRepo.save(property);
      console.log(
        `  🏢 Created Property Facility: ${savedProperty.title} (${savedProperty.city})`
      );

      // Create Units for this property
      const createdUnits = units.map(u =>
        unitRepo.create({
          tenantId,
          propertyId: savedProperty.id,
          ...u,
        })
      );
      await unitRepo.save(createdUnits);
      console.log(`     └─ Created ${createdUnits.length} residential units`);

      // Assign property access to manager@sunriise.com if found
      const manager = await userRepo.findOne({
        where: { email: "manager@sunriise.com" },
      });
      if (manager) {
        const assignment = assigneeRepo.create({
          tenantId,
          userId: manager.id,
          propertyId: savedProperty.id,
          assignedBy: adminId,
          assignedAt: new Date(),
        });
        await assigneeRepo.save(assignment);
      }
    }
  }

  console.log(
    "\n✨ All properties & residential units wiped and re-seeded cleanly across ALL tenant contexts!"
  );
  await AppDataSource.destroy();
}

seedProperties().catch(err => {
  console.error("❌ Property seeding failed:", err);
  process.exit(1);
});
