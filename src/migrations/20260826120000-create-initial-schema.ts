import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  // 1. company
  await queryInterface.createTable('company', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    company_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Name of the company',
    },
    company_gst_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'GST number of the company',
    },
    email_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Email ID of the company',
    },
    contact_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'Primary contact number of the company',
    },
    alternate_contact_number: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Alternate contact number of the company',
    },
    company_head_office_address: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Head office address of the company',
    },
    document_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Name of the uploaded document',
    },
    document_description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Description of the uploaded document',
    },
    document_path: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'File path for the uploaded document',
    },
    bank_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Bank name of the company',
    },
    branch_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Branch name of the bank',
    },
    account_no: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Bank account number of the company',
    },
    ifsc_code: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'IFSC code of the bank',
    },
    accountant_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Name of the accountant',
    },
    accountant_signature: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'File path for the accountant signature',
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

  // 2. company_custom_fields
  await queryInterface.createTable('company_custom_fields', {
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
      onDelete: 'CASCADE',
    },
    fieldName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fieldLabel: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fieldType: {
      type: DataTypes.ENUM('text', 'number', 'date', 'select', 'bool', 'document'),
      allowNull: false,
    },
    fieldValue: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    enumValues: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    displayOrder: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    defaultValue: {
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

  // 3. properties
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
    amenities: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'List of amenities e.g. ["gym","pool","parking"]',
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

  // 4. property_blocks
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

  // 5. property_floors
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

  // 6. property_units
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

  // 7. users
  await queryInterface.createTable('users', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    companyId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    defaultLocationId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    username: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'BLOCKED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  })

  // 8. user_details
  await queryInterface.createTable('user_details', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    gender: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    dateOfJoining: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    photoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    employeeCode: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    emergencyContact: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    bloodGroup: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    qualification: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    experience: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  })

  // 9. departments
  await queryInterface.createTable('departments', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  })

  // 10. job_categories
  await queryInterface.createTable('job_categories', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    departmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'departments', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  })

  // 11. roles
  await queryInterface.createTable('roles', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  })

  // 12. resources
  await queryInterface.createTable('resources', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  })

  // 13. user_locations
  await queryInterface.createTable('user_locations', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    companyId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    departmentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    jobCategoryId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    assignedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  })

  await queryInterface.addIndex('user_locations', ['userId', 'locId'], {
    unique: true,
    name: 'uk_user_location',
  })

  // 14. user_location_permissions
  await queryInterface.createTable('user_location_permissions', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
    },
    locationId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
    },
    resourceKey: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    permission: {
      type: DataTypes.ENUM('view', 'create', 'update', 'delete'),
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  })

  await queryInterface.addIndex('user_location_permissions', ['userId', 'locationId', 'resourceKey', 'permission'], {
    unique: true,
    name: 'uk_user_loc_res_perm',
  })

  // 15. employee_managers
  await queryInterface.createTable('employee_managers', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    managerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  })
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.dropTable('employee_managers')
  await queryInterface.dropTable('user_location_permissions')
  await queryInterface.dropTable('user_locations')
  await queryInterface.dropTable('resources')
  await queryInterface.dropTable('roles')
  await queryInterface.dropTable('job_categories')
  await queryInterface.dropTable('departments')
  await queryInterface.dropTable('user_details')
  await queryInterface.dropTable('users')
  await queryInterface.dropTable('property_units')
  await queryInterface.dropTable('property_floors')
  await queryInterface.dropTable('property_blocks')
  await queryInterface.dropTable('properties')
  await queryInterface.dropTable('company_custom_fields')
  await queryInterface.dropTable('company')
}
