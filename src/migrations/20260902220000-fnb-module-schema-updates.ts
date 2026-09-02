import { QueryInterface, DataTypes } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const commonFields = {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.UUID,
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

  // 1. Make residentId in fnb_resident_packages nullable
  try {
    const tableDescription = await queryInterface.describeTable('fnb_resident_packages')
    if (tableDescription.residentId) {
      await queryInterface.changeColumn('fnb_resident_packages', 'residentId', {
        type: DataTypes.UUID,
        allowNull: true,
      })
    }
  } catch {
    // Ignore if table/column does not exist
  }

  // 2. Create fnb_global_meal_slots table
  try {
    await queryInterface.createTable('fnb_global_meal_slots', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      startTime: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '07:30',
      },
      endTime: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '10:00',
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      createdBy: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      updatedBy: {
        type: DataTypes.UUID,
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
  } catch {
    // Already created
  }

  // 3. Ensure fnb_global_meal_slots.id binary collation
  try {
    await queryInterface.sequelize.query(
      'ALTER TABLE fnb_global_meal_slots MODIFY COLUMN id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;',
    )
  } catch {
    // ignore
  }

  // 4. Create fnb_property_meal_slots table
  try {
    await queryInterface.createTable('fnb_property_meal_slots', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      locId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      globalMealSlotId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      startTime: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      endTime: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      createdBy: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      updatedBy: {
        type: DataTypes.UUID,
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
  } catch {
    // Already created
  }

  // 5. Make code column in fnb_global_meal_slots nullable if exists
  try {
    await queryInterface.changeColumn('fnb_global_meal_slots', 'code', {
      type: DataTypes.STRING,
      allowNull: true,
    })
  } catch {
    // Column already nullable or doesn't exist
  }

  // 6. Add mealSlotId column to fnb_menu_items & ensure mealSlot is VARCHAR(255)
  try {
    await queryInterface.addColumn('fnb_menu_items', 'mealSlotId', {
      type: DataTypes.UUID,
      allowNull: true,
    })
  } catch {
    // Column already exists
  }

  try {
    await queryInterface.changeColumn('fnb_menu_items', 'mealSlot', {
      type: DataTypes.STRING(255),
      allowNull: true,
    })
  } catch {
    // Ignore if already changed
  }

  // 7. Create fnb_global_special_slots table
  try {
    await queryInterface.createTable('fnb_global_special_slots', {
      ...commonFields,
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })
  } catch {
    // Already created
  }

  // 8. Create fnb_property_special_slots table
  try {
    await queryInterface.createTable('fnb_property_special_slots', {
      ...commonFields,
      globalSpecialSlotId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'fnb_global_special_slots', key: 'id' },
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
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })
    await queryInterface.addIndex('fnb_property_special_slots', ['locId', 'globalSpecialSlotId'], {
      unique: true,
      name: 'idx_prop_special_slot_unique',
    })
  } catch {
    // Already created
  }

  // 9. Create fnb_property_special_dishes table
  try {
    await queryInterface.createTable('fnb_property_special_dishes', {
      ...commonFields,
      propertySpecialSlotId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'fnb_property_special_slots', key: 'id' },
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
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    })
    await queryInterface.addIndex('fnb_property_special_dishes', ['locId', 'propertySpecialSlotId'], {
      name: 'idx_special_dishes_loc',
    })
  } catch {
    // Already created
  }

  // 10. Alter fnb_resident_orders columns
  try {
    await queryInterface.changeColumn('fnb_resident_orders', 'residentId', {
      type: DataTypes.UUID,
      allowNull: true,
    })
  } catch {
    // Ignore error
  }

  try {
    await queryInterface.addColumn('fnb_resident_orders', 'familyMemberId', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'resident_family_members', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    })
  } catch {
    // Ignore error
  }

  try {
    await queryInterface.addColumn('fnb_resident_orders', 'mealSlotId', {
      type: DataTypes.UUID,
      allowNull: true,
    })
  } catch {
    // Ignore error
  }

  try {
    await queryInterface.addColumn('fnb_resident_orders', 'specialMealSlotId', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'fnb_property_special_slots', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    })
  } catch {
    // Ignore error
  }

  try {
    await queryInterface.addColumn('fnb_resident_orders', 'isDish', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    })
  } catch {
    // Ignore error
  }

  try {
    await queryInterface.addColumn('fnb_resident_orders', 'orderType', {
      type: DataTypes.ENUM('personal', 'guest', 'special', 'custom'),
      allowNull: false,
      defaultValue: 'personal',
    })
  } catch {
    try {
      await queryInterface.changeColumn('fnb_resident_orders', 'orderType', {
        type: DataTypes.ENUM('personal', 'guest', 'special', 'custom'),
        allowNull: false,
        defaultValue: 'personal',
      })
    } catch {
      // Ignore error
    }
  }

  try {
    await queryInterface.addColumn('fnb_resident_orders', 'selectionType', {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'dish',
    })
  } catch {
    // Ignore error
  }

  try {
    await queryInterface.addColumn('fnb_resident_orders', 'serviceType', {
      type: DataTypes.ENUM('dine_in', 'room_service'),
      allowNull: false,
      defaultValue: 'room_service',
    })
  } catch {
    try {
      await queryInterface.changeColumn('fnb_resident_orders', 'serviceType', {
        type: DataTypes.ENUM('dine_in', 'room_service'),
        allowNull: false,
        defaultValue: 'room_service',
      })
    } catch {
      // Ignore error
    }
  }

  try {
    await queryInterface.changeColumn('fnb_resident_orders', 'orderStatus', {
      type: DataTypes.ENUM(
        'placed',
        'accepted',
        'preparing',
        'ready',
        'delivering_to_room',
        'completed',
        'delivered',
        'cancelled',
      ),
      allowNull: false,
      defaultValue: 'placed',
    })
  } catch {
    // Ignore error
  }

  const orderFields = [
    { name: 'acceptedAt', type: DataTypes.DATE },
    { name: 'preparingStartedAt', type: DataTypes.DATE },
    { name: 'readyAt', type: DataTypes.DATE },
    { name: 'deliveredAt', type: DataTypes.DATE },
    { name: 'deliveryCharge', type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
    { name: 'assignedEmployeeId', type: DataTypes.UUID },
  ]

  for (const field of orderFields) {
    try {
      await queryInterface.addColumn('fnb_resident_orders', field.name, {
        type: field.type,
        allowNull: true,
        defaultValue: field.defaultValue,
      })
    } catch {
      // Ignore error
    }
  }

  try {
    await queryInterface.removeIndex('fnb_resident_orders', ['residentId', 'date', 'mealSlot'])
  } catch {
    // Ignore error
  }

  const unusedCols = ['dishId', 'guestName', 'guestCount', 'cutoffTime', 'mealSlot', 'menuItemId']
  for (const col of unusedCols) {
    try {
      await queryInterface.removeColumn('fnb_resident_orders', col)
    } catch {
      // Ignore error
    }
  }

  // 11. Create fnb_resident_order_details table
  try {
    await queryInterface.createTable('fnb_resident_order_details', {
      ...commonFields,
      orderId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'fnb_resident_orders', key: 'id' },
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
      mealSlotId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'fnb_global_meal_slots', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      specialMealSlotId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'fnb_property_special_slots', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      specialMealSlotDishId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'fnb_property_special_dishes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
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
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      isPackageCovered: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    })
    await queryInterface.addIndex('fnb_resident_order_details', ['orderId'], { name: 'idx_order_details_order_id' })
    await queryInterface.addIndex('fnb_resident_order_details', ['dishId'], { name: 'idx_order_details_dish_id' })
    await queryInterface.addIndex('fnb_resident_order_details', ['mealSlotId'], { name: 'idx_order_details_slot_id' })
    await queryInterface.addIndex('fnb_resident_order_details', ['specialMealSlotId'], {
      name: 'idx_order_details_special_slot_id',
    })
  } catch {
    // Already created
  }

  // 12. Create fnb_food_deliveries table
  try {
    await queryInterface.createTable('fnb_food_deliveries', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      orderId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'fnb_resident_orders',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      employeeId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      deliveryCharge: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      deliveryStatus: {
        type: DataTypes.ENUM('assigned', 'delivering', 'delivered', 'failed'),
        allowNull: false,
        defaultValue: 'assigned',
      },
      photoUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      deliveryDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      deliveredAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdBy: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      updatedBy: {
        type: DataTypes.UUID,
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
  } catch {
    // Table already exists
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  try {
    await queryInterface.dropTable('fnb_food_deliveries')
  } catch {
    // Ignore error
  }
  try {
    await queryInterface.dropTable('fnb_resident_order_details')
  } catch {
    // Ignore error
  }
  try {
    await queryInterface.dropTable('fnb_property_special_dishes')
  } catch {
    // Ignore error
  }
  try {
    await queryInterface.dropTable('fnb_property_special_slots')
  } catch {
    // Ignore error
  }
  try {
    await queryInterface.dropTable('fnb_global_special_slots')
  } catch {
    // Ignore error
  }
  try {
    await queryInterface.dropTable('fnb_property_meal_slots')
  } catch {
    // Ignore error
  }
  try {
    await queryInterface.dropTable('fnb_global_meal_slots')
  } catch {
    // Ignore error
  }
}
