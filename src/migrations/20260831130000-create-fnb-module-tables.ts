import { DataTypes, type QueryInterface } from 'sequelize'

const commonFields = {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
  createdBy: {
    type: DataTypes.CHAR(36),
    allowNull: true,
  },
  updatedBy: {
    type: DataTypes.CHAR(36),
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
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  // 1. Global Food Packages Master
  if (!tables.includes('fnb_global_packages')) {
    await queryInterface.createTable('fnb_global_packages', {
      ...commonFields,
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      dietaryType: {
        type: DataTypes.ENUM('veg', 'non_veg', 'egg', 'jain', 'mixed', 'vegan'),
        allowNull: false,
        defaultValue: 'veg',
      },
      includedMealSlots: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: 'JSON array e.g. ["breakfast", "lunch", "snacks", "dinner"]',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })
  }

  // 2. Property Food Packages (Property Assignment & Pricing)
  if (!tables.includes('fnb_property_packages')) {
    await queryInterface.createTable('fnb_property_packages', {
      ...commonFields,
      locId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      globalPackageId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'fnb_global_packages', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'Monthly package price for property',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })
    await queryInterface.addIndex('fnb_property_packages', ['locId', 'globalPackageId'], {
      unique: true,
    })
  }

  // 3. Resident Food Packages (Subscriptions)
  if (!tables.includes('fnb_resident_packages')) {
    await queryInterface.createTable('fnb_resident_packages', {
      ...commonFields,
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'residents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      familyMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'resident_family_members', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      propertyPackageId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'fnb_property_packages', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      dietaryPreference: {
        type: DataTypes.ENUM('veg', 'non_veg', 'egg', 'jain', 'vegan'),
        allowNull: false,
        defaultValue: 'veg',
      },
      allergiesNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('active', 'paused', 'cancelled', 'completed'),
        allowNull: false,
        defaultValue: 'active',
      },
    })
    await queryInterface.addIndex('fnb_resident_packages', ['residentId', 'status'])
  }

  // 4. Dishes Catalogue (Global / Master)
  if (!tables.includes('fnb_dishes')) {
    await queryInterface.createTable('fnb_dishes', {
      ...commonFields,
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      category: {
        type: DataTypes.ENUM(
          'breakfast',
          'starters',
          'main_course',
          'breads',
          'rice_biryani',
          'snacks_desserts',
          'beverages',
          'other',
        ),
        allowNull: false,
        defaultValue: 'main_course',
      },
      dietaryType: {
        type: DataTypes.ENUM('veg', 'non_veg', 'egg', 'jain', 'vegan'),
        allowNull: false,
        defaultValue: 'veg',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      basePrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      nutritionalInfo: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      imageUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })
  }

  // 5. Property Dish Pricing & Availability Overrides
  if (!tables.includes('fnb_property_dishes')) {
    await queryInterface.createTable('fnb_property_dishes', {
      ...commonFields,
      locId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      dishId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'fnb_dishes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      isAvailable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })
    await queryInterface.addIndex('fnb_property_dishes', ['locId', 'dishId'], { unique: true })
  }

  // 6. Flexible Menu Container
  if (!tables.includes('fnb_menus')) {
    await queryInterface.createTable('fnb_menus', {
      ...commonFields,
      locId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('draft', 'published', 'archived'),
        allowNull: false,
        defaultValue: 'published',
      },
    })
  }

  // 7. Menu Items Mapping
  if (!tables.includes('fnb_menu_items')) {
    await queryInterface.createTable('fnb_menu_items', {
      ...commonFields,
      menuId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'fnb_menus', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      locId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      dayOfWeek: {
        type: DataTypes.ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'),
        allowNull: true,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      isOverride: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      mealSlot: {
        type: DataTypes.ENUM('breakfast', 'lunch', 'snacks', 'dinner'),
        allowNull: false,
      },
      dishId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'fnb_dishes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      isOptional: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      extraPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      notes: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    })
    await queryInterface.addIndex('fnb_menu_items', ['menuId', 'date', 'mealSlot'])
  }

  // 8. Resident Daily / Per-Meal Orders Ledger
  if (!tables.includes('fnb_resident_orders')) {
    await queryInterface.createTable('fnb_resident_orders', {
      ...commonFields,
      locId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'residents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      residentPackageId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'fnb_resident_packages', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      menuItemId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'fnb_menu_items', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      dishId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'fnb_dishes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      mealSlot: {
        type: DataTypes.ENUM('breakfast', 'lunch', 'snacks', 'dinner'),
        allowNull: false,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      unitPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '0.00 if package covered; dish price if a-la-carte',
      },
      totalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      isPackageCovered: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      orderStatus: {
        type: DataTypes.ENUM('placed', 'served', 'cancelled'),
        allowNull: false,
        defaultValue: 'placed',
      },
    })
    await queryInterface.addIndex('fnb_resident_orders', ['residentId', 'date', 'mealSlot'])
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0;')
  await queryInterface.dropTable('fnb_resident_orders')
  await queryInterface.dropTable('fnb_menu_items')
  await queryInterface.dropTable('fnb_menus')
  await queryInterface.dropTable('fnb_property_dishes')
  await queryInterface.dropTable('fnb_dishes')
  await queryInterface.dropTable('fnb_resident_packages')
  await queryInterface.dropTable('fnb_property_packages')
  await queryInterface.dropTable('fnb_global_packages')
  await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1;')
}
