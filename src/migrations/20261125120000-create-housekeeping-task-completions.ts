import { DataTypes, type QueryInterface } from 'sequelize'

const TABLE = 'housekeeping_task_completions'

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (tableNames.includes(TABLE)) {
    console.log(`Table ${TABLE} already exists; skipping.`)
    return
  }

  await queryInterface.createTable(TABLE, {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
    shiftDateId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'shift_dates', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'properties', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    comment: { type: DataTypes.TEXT, allowNull: true },
    attachments: { type: DataTypes.JSON, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    extraMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: 'Minutes completed after scheduled shift/slot end',
    },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  })

  await queryInterface.addIndex(TABLE, ['shiftDateId'], {
    name: 'hk_task_completions_shift_date_unique',
    unique: true,
  })
  await queryInterface.addIndex(TABLE, ['employeeId', 'locationId', 'status'], {
    name: 'hk_task_completions_employee_loc_status_idx',
  })
  await queryInterface.addIndex(TABLE, ['isDeleted'], {
    name: 'hk_task_completions_deleted_idx',
  })
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)
  if (!tableNames.includes(TABLE)) return
  await queryInterface.dropTable(TABLE)
}
