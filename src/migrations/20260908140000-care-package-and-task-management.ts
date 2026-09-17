import { DataTypes, type QueryInterface } from 'sequelize'
import { v4 as uuidv4 } from 'uuid'

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

  const describeSafe = async (tableName: string): Promise<Record<string, unknown>> => {
    try {
      return (await queryInterface.describeTable(tableName)) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  // 1. Update care_tasks with billingType and price
  if (tables.includes('care_tasks')) {
    const careTasksDesc = await describeSafe('care_tasks')

    if (!careTasksDesc.billingType) {
      await queryInterface.addColumn('care_tasks', 'billingType', {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'MONTHLY',
        comment: 'MONTHLY or SESSION',
      })
    }

    if (!careTasksDesc.price) {
      await queryInterface.addColumn('care_tasks', 'price', {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'Rate according to billingType',
      })
    }

    await queryInterface.sequelize
      .query(
        `
      UPDATE care_tasks
      SET 
        billingType = CASE 
          WHEN sessionRate > 0 AND monthlyRate <= 0 THEN 'SESSION'
          ELSE 'MONTHLY'
        END,
        price = CASE 
          WHEN sessionRate > 0 AND monthlyRate <= 0 THEN sessionRate
          WHEN monthlyRate > 0 THEN monthlyRate
          WHEN dailyRate > 0 THEN dailyRate
          ELSE 0.00
        END
      WHERE price = 0.00;
    `,
      )
      .catch(() => {
        // Ignore if columns already processed
      })
  }

  // 2. Remove deprecated tasks column from packages table
  if (tables.includes('packages')) {
    const packagesDesc = await describeSafe('packages')
    if (packagesDesc.tasks) {
      await queryInterface.removeColumn('packages', 'tasks').catch(() => {})
    }
  }

  // 3. Add carePackageId to residents table
  if (tables.includes('residents')) {
    const residentsDesc = await describeSafe('residents')
    if (!residentsDesc.carePackageId) {
      await queryInterface.addColumn('residents', 'carePackageId', {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'packages',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'FK -> packages.id',
      })
    }
  }

  // 4. Create package_subscriptions table
  if (!tables.includes('package_subscriptions')) {
    await queryInterface.createTable('package_subscriptions', {
      ...commonFields,
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'residents',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      carePackageId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'packages',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'CANCELLED', 'COMPLETED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      totalCost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      propertyId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'properties',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      previous: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
    })

    await queryInterface.addIndex('package_subscriptions', ['residentId'])
    await queryInterface.addIndex('package_subscriptions', ['carePackageId'])
    await queryInterface.addIndex('package_subscriptions', ['propertyId'])
    await queryInterface.addIndex('package_subscriptions', ['status'])
    await queryInterface.addIndex('package_subscriptions', ['startDate'])
    await queryInterface.addIndex('package_subscriptions', ['isDeleted'])
  }

  // 5. Create package_subscription_features table
  if (!tables.includes('package_subscription_features')) {
    await queryInterface.createTable('package_subscription_features', {
      ...commonFields,
      packageSubscriptionId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'package_subscriptions',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      featureId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'care_tasks',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      complimentaryCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      remainingCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
    })

    await queryInterface.addIndex('package_subscription_features', ['packageSubscriptionId'])
    await queryInterface.addIndex('package_subscription_features', ['featureId'])
    await queryInterface.addIndex(
      'package_subscription_features',
      ['packageSubscriptionId', 'featureId', 'isDeleted'],
      {
        name: 'idx_psf_unique',
        unique: true,
      },
    )
  }

  // 6. Create care_package_features_map table
  if (!tables.includes('care_package_features_map')) {
    await queryInterface.createTable('care_package_features_map', {
      ...commonFields,
      carePackageId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'packages',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      featureId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'care_tasks',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      complimentaryCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
    })

    await queryInterface.addIndex('care_package_features_map', ['carePackageId'])
    await queryInterface.addIndex('care_package_features_map', ['featureId'])
    await queryInterface.addIndex('care_package_features_map', ['carePackageId', 'featureId', 'isDeleted'], {
      name: 'idx_cpfm_unique',
      unique: true,
    })

    // Backfill from existing packages if packages table had tasks column
    try {
      const [existingPackages] = (await queryInterface.sequelize.query(
        'SELECT id, tasks FROM packages WHERE isDeleted = 0;',
      )) as [
        Array<{
          id: string
          tasks: string | Array<{ taskId?: string; featureId?: string; complimentaryCount?: number }>
        }>,
        unknown,
      ]

      const rowsToInsert: Array<{
        id: string
        carePackageId: string
        featureId: string
        complimentaryCount: number
        isActive: boolean
        isDeleted: boolean
        createdAt: Date
        updatedAt: Date
      }> = []

      for (const pkg of existingPackages) {
        let tasks: Array<{ taskId?: string; featureId?: string; complimentaryCount?: number }> = []
        if (typeof pkg.tasks === 'string') {
          try {
            tasks = JSON.parse(pkg.tasks)
          } catch {
            tasks = []
          }
        } else if (Array.isArray(pkg.tasks)) {
          tasks = pkg.tasks
        }

        for (const item of tasks) {
          const featureId = item.taskId || item.featureId
          if (featureId) {
            rowsToInsert.push({
              id: uuidv4(),
              carePackageId: pkg.id,
              featureId,
              complimentaryCount: Number(item.complimentaryCount) || 1,
              isActive: true,
              isDeleted: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          }
        }
      }

      if (rowsToInsert.length > 0) {
        await queryInterface.bulkInsert('care_package_features_map', rowsToInsert)
      }
    } catch {
      // Ignore if tasks column no longer exists on packages
    }
  }

  // 7. Create care_task_assignments table
  if (!tables.includes('care_task_assignments')) {
    await queryInterface.createTable('care_task_assignments', {
      ...commonFields,
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'residents',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      taskId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'care_tasks',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      propertyId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'properties',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      nurseId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      packageSubscriptionId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'package_subscriptions',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'FK -> package_subscriptions.id',
      },
      carePackageId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'packages',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'FK -> packages.id',
      },
      source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'ADDON',
        comment: 'PACKAGE or ADDON',
      },
      billingType: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'SESSION',
        comment: 'MONTHLY or SESSION',
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      frequency: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 1,
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      time: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: '12:00 PM',
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'ACTIVE',
        comment: 'ACTIVE, PENDING, COMPLETED, STOPPED, CANCELLED',
      },
      customInstructions: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isStopped: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      stoppedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      stoppedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      completedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      completionCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
    })

    await queryInterface.addIndex('care_task_assignments', ['residentId'])
    await queryInterface.addIndex('care_task_assignments', ['taskId'])
    await queryInterface.addIndex('care_task_assignments', ['propertyId'])
    await queryInterface.addIndex('care_task_assignments', ['packageSubscriptionId'])
    await queryInterface.addIndex('care_task_assignments', ['carePackageId'])
    await queryInterface.addIndex('care_task_assignments', ['source'])
    await queryInterface.addIndex('care_task_assignments', ['status'])
    await queryInterface.addIndex('care_task_assignments', ['isDeleted'])
  } else {
    // If care_task_assignments already exists, ensure packageSubscriptionId, carePackageId, and source columns exist
    const assignmentsDesc = await describeSafe('care_task_assignments')

    if (!assignmentsDesc.packageSubscriptionId) {
      await queryInterface.addColumn('care_task_assignments', 'packageSubscriptionId', {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'package_subscriptions',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'FK -> package_subscriptions.id',
      })
      await queryInterface.addIndex('care_task_assignments', ['packageSubscriptionId'])
    }

    if (!assignmentsDesc.carePackageId) {
      await queryInterface.addColumn('care_task_assignments', 'carePackageId', {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'packages',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'FK -> packages.id',
      })
      await queryInterface.addIndex('care_task_assignments', ['carePackageId'])
    }

    if (!assignmentsDesc.source) {
      await queryInterface.addColumn('care_task_assignments', 'source', {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'ADDON',
        comment: 'PACKAGE or ADDON',
      })
      await queryInterface.addIndex('care_task_assignments', ['source'])
    }
  }

  // Normalize source, billingType, and status for care_task_assignments
  await queryInterface.sequelize
    .query(
      `
    UPDATE care_task_assignments
    SET 
      source = CASE 
        WHEN billingType = 'Package Plan' OR customInstructions LIKE '%Included in%' THEN 'PACKAGE'
        ELSE 'ADDON'
      END,
      billingType = CASE 
        WHEN billingType = 'Package Plan' THEN 'MONTHLY'
        WHEN UPPER(billingType) LIKE 'MONTH%' THEN 'MONTHLY'
        ELSE 'SESSION'
      END,
      status = CASE 
        WHEN UPPER(status) = 'STOPPED' THEN 'STOPPED'
        WHEN UPPER(status) = 'CANCELLED' THEN 'CANCELLED'
        ELSE 'ACTIVE'
      END;
  `,
    )
    .catch(() => {})

  // 8. Create additional_task_charges table
  if (!tables.includes('additional_task_charges')) {
    await queryInterface.createTable('additional_task_charges', {
      ...commonFields,
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'residents',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      featureId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'care_tasks',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      nurseId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      taskAssignmentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'care_task_assignments',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      unitPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
      },
      taskName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      completedAt: {
        type: DataTypes.DATE,
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
    })

    await queryInterface.addIndex('additional_task_charges', ['residentId'])
    await queryInterface.addIndex('additional_task_charges', ['featureId'])
    await queryInterface.addIndex('additional_task_charges', ['nurseId'])
    await queryInterface.addIndex('additional_task_charges', ['taskAssignmentId'])
    await queryInterface.addIndex('additional_task_charges', ['completedAt'])
    await queryInterface.addIndex('additional_task_charges', ['isDeleted'])
  } else {
    const chargesDesc = await describeSafe('additional_task_charges')

    if (!chargesDesc.taskAssignmentId) {
      await queryInterface.addColumn('additional_task_charges', 'taskAssignmentId', {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'care_task_assignments',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      })
      await queryInterface.addIndex('additional_task_charges', ['taskAssignmentId'])
    }

    if (!chargesDesc.unitPrice) {
      await queryInterface.addColumn('additional_task_charges', 'unitPrice', {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
      })
    }
  }

  // 9. Create resident_care_task_completions table
  if (!tables.includes('resident_care_task_completions')) {
    await queryInterface.createTable('resident_care_task_completions', {
      ...commonFields,
      residentCareTaskAssignmentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'care_task_assignments',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      residentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'residents',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      taskId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'care_tasks',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      propertyId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'properties',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      completedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('COMPLETED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'COMPLETED',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
      },
      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
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
    })

    await queryInterface.addIndex('resident_care_task_completions', ['residentCareTaskAssignmentId'])
    await queryInterface.addIndex('resident_care_task_completions', ['residentId'])
    await queryInterface.addIndex('resident_care_task_completions', ['taskId'])
    await queryInterface.addIndex('resident_care_task_completions', ['propertyId'])
    await queryInterface.addIndex('resident_care_task_completions', ['completedBy'])
    await queryInterface.addIndex('resident_care_task_completions', ['completedAt'])
    await queryInterface.addIndex('resident_care_task_completions', ['status'])
    await queryInterface.addIndex('resident_care_task_completions', ['isDeleted'])
  } else {
    // If resident_care_task_completions already exists, remove legacy billing fields if any exist
    const completionsDesc = await describeSafe('resident_care_task_completions')
    if (completionsDesc.price) {
      await queryInterface.removeColumn('resident_care_task_completions', 'price').catch(() => {})
    }
    if (completionsDesc.billingType) {
      await queryInterface.removeColumn('resident_care_task_completions', 'billingType').catch(() => {})
    }
    if (completionsDesc.isBillable) {
      await queryInterface.removeColumn('resident_care_task_completions', 'isBillable').catch(() => {})
    }
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const rawTables = await queryInterface.showAllTables()
  const tables = rawTables.map((t) =>
    typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t),
  )

  const describeSafe = async (tableName: string): Promise<Record<string, unknown>> => {
    try {
      return (await queryInterface.describeTable(tableName)) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  // 1. Drop child completion table
  if (tables.includes('resident_care_task_completions')) {
    await queryInterface.dropTable('resident_care_task_completions')
  }

  // 2. Drop additional task charges table
  if (tables.includes('additional_task_charges')) {
    await queryInterface.dropTable('additional_task_charges')
  }

  // 3. Drop care task assignments table
  if (tables.includes('care_task_assignments')) {
    await queryInterface.dropTable('care_task_assignments')
  }

  // 4. Drop care package features map table
  if (tables.includes('care_package_features_map')) {
    await queryInterface.dropTable('care_package_features_map')
  }

  // 5. Drop package subscription features table
  if (tables.includes('package_subscription_features')) {
    await queryInterface.dropTable('package_subscription_features')
  }

  // 6. Drop package subscriptions table
  if (tables.includes('package_subscriptions')) {
    await queryInterface.dropTable('package_subscriptions')
  }

  // 7. Remove carePackageId from residents table
  if (tables.includes('residents')) {
    const residentsDesc = await describeSafe('residents')
    if (residentsDesc.carePackageId) {
      await queryInterface.removeColumn('residents', 'carePackageId').catch(() => {})
    }
  }

  // 8. Remove billingType and price from care_tasks table
  if (tables.includes('care_tasks')) {
    const careTasksDesc = await describeSafe('care_tasks')
    if (careTasksDesc.price) {
      await queryInterface.removeColumn('care_tasks', 'price').catch(() => {})
    }
    if (careTasksDesc.billingType) {
      await queryInterface.removeColumn('care_tasks', 'billingType').catch(() => {})
    }
  }
}
