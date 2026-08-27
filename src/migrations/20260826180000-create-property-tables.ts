import { DataTypes } from 'sequelize'
import type { QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  // ─── 1. properties ───────────────────────────────────────────────────────────
  await queryInterface.createTable('properties', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
      comment: 'FK → company.id',
    },
    property_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Name of the property / project',
    },
    property_type: {
      type: DataTypes.ENUM('apartment', 'villa', 'duplex', 'triplex'),
      allowNull: false,
      defaultValue: 'apartment',
      comment: 'Type of residential property',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Optional description of the property',
    },
    // ── Address ────────────────────────────────────────────────────────────────
    street: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Street address',
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'City',
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'State',
    },
    pincode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'PIN / ZIP code',
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'India',
      comment: 'Country',
    },
    // ── Area ──────────────────────────────────────────────────────────────────
    total_area: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      comment: 'Total land / project area',
    },
    area_unit: {
      type: DataTypes.ENUM('sqft', 'sqmt', 'acres'),
      allowNull: true,
      defaultValue: 'sqft',
      comment: 'Unit of measurement for area',
    },
    // ── Meta ──────────────────────────────────────────────────────────────────
    amenities: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'List of amenities e.g. ["gym","pool","parking"]',
    },
    status: {
      type: DataTypes.ENUM('under_construction', 'ready_to_move', 'sold_out'),
      allowNull: false,
      defaultValue: 'under_construction',
      comment: 'Current status of the property project',
    },
    launch_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Project launch date',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  // ─── 2. property_blocks (Tower / Block) ──────────────────────────────────────
  await queryInterface.createTable('property_blocks', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'properties',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'FK → properties.id',
    },
    block_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Block or Tower name e.g. "Block A", "Tower 1"',
    },
    total_floors: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Total number of floors in this block',
    },
    units_per_floor: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Units per floor',
    },
    prefix: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Tower prefix e.g. "B"',
    },
    price_per_sqft: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      comment: 'Base price per sqft',
    },
    nomenclature_template: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Unit naming template e.g. {{TowerPrefix}}-{{FloorNumber}}{{Position}}',
    },
    bhk_templates: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'BHK template variants JSON array',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  // ─── 3. property_floors ───────────────────────────────────────────────────────
  await queryInterface.createTable('property_floors', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    blockId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'property_blocks',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'FK → property_blocks.id',
    },
    floor_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Numeric floor number (0 = Ground Floor)',
    },
    floor_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Display name e.g. "Ground Floor", "First Floor"',
    },
    floor_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'FLOOR',
      comment: 'FLOOR, GROUND_FLOOR, BASEMENT, STILT, PENTHOUSE',
    },
    is_sellable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
      comment: 'Whether floor contains sellable units',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  // ─── 4. property_units ────────────────────────────────────────────────────────
  await queryInterface.createTable('property_units', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    floorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'property_floors',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'FK → property_floors.id',
    },
    unit_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Unit / Flat number e.g. "101", "A-201"',
    },
    unit_type: {
      type: DataTypes.ENUM('1BHK', '2BHK', '3BHK', '4BHK', 'studio', 'penthouse', 'shop', 'office'),
      allowNull: false,
      defaultValue: '2BHK',
      comment: 'Type of unit',
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Position index e.g. 1, 2, 3',
    },
    direction: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Direction e.g. North-East, North',
    },
    view_facing: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'View facing e.g. Garden View, Road View',
    },
    is_sellable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    carpet_area: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Carpet area of the unit',
    },
    built_up_area: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Built-up area of the unit',
    },
    super_built_up_area: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Super built-up area of the unit',
    },
    area_unit: {
      type: DataTypes.ENUM('sqft', 'sqmt', 'acres'),
      allowNull: true,
      defaultValue: 'sqft',
    },
    facing: {
      type: DataTypes.ENUM('north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'),
      allowNull: true,
      comment: 'Facing direction of the unit',
    },
    price: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      comment: 'Total price of the unit',
    },
    price_per_sqft: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Price per square foot',
    },
    status: {
      type: DataTypes.ENUM('available', 'booked', 'sold', 'on_hold'),
      allowNull: false,
      defaultValue: 'available',
      comment: 'Availability status of the unit',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })
}

export async function down({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.dropTable('property_units')
  await queryInterface.dropTable('property_floors')
  await queryInterface.dropTable('property_blocks')
  await queryInterface.dropTable('properties')
}
