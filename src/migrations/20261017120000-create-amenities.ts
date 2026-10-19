import { DataTypes, type QueryInterface } from 'sequelize'

async function getTableNames(queryInterface: QueryInterface): Promise<string[]> {
  const tables = await queryInterface.showAllTables()
  return tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName || String(t)))
}

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)

  if (!tableNames.includes('amenities')) {
    await queryInterface.createTable('amenities', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      name: { type: DataTypes.STRING(150), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdBy: { type: DataTypes.CHAR(36), allowNull: true },
      updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    })

    await queryInterface.addIndex('amenities', ['name'], { name: 'amenities_name_unique', unique: true })
    await queryInterface.addIndex('amenities', ['isActive', 'isDeleted'], { name: 'amenities_active_idx' })
  }

  if (!tableNames.includes('property_amenities')) {
    await queryInterface.createTable('property_amenities', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      propertyId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      amenityId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'amenities', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      slotBookable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      settings: { type: DataTypes.JSON, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdBy: { type: DataTypes.CHAR(36), allowNull: true },
      updatedBy: { type: DataTypes.CHAR(36), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    })

    await queryInterface.addIndex('property_amenities', ['propertyId', 'amenityId'], {
      name: 'property_amenities_property_amenity_unique',
      unique: true,
    })
    await queryInterface.addIndex('property_amenities', ['propertyId', 'isDeleted'], {
      name: 'property_amenities_property_idx',
    })
    await queryInterface.addIndex('property_amenities', ['amenityId', 'isDeleted'], {
      name: 'property_amenities_amenity_idx',
    })
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableNames = await getTableNames(queryInterface)

  if (tableNames.includes('property_amenities')) {
    await queryInterface.dropTable('property_amenities')
  }
  if (tableNames.includes('amenities')) {
    await queryInterface.dropTable('amenities')
  }
}
