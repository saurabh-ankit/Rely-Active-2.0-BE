import { DataTypes, type QueryInterface } from 'sequelize'

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = (await queryInterface.describeTable('fnb_resident_packages')) as Record<string, unknown>

  if (tableDescription.dietaryPreference) {
    await queryInterface.changeColumn('fnb_resident_packages', 'dietaryPreference', {
      type: DataTypes.ENUM('veg', 'non_veg', 'egg', 'jain', 'mixed', 'vegan'),
      allowNull: true,
      defaultValue: 'veg',
    })
    console.log("✅ Added 'mixed' to fnb_resident_packages.dietaryPreference")
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  const tableDescription = (await queryInterface.describeTable('fnb_resident_packages')) as Record<string, unknown>

  if (tableDescription.dietaryPreference) {
    await queryInterface.changeColumn('fnb_resident_packages', 'dietaryPreference', {
      type: DataTypes.ENUM('veg', 'non_veg', 'egg', 'jain', 'vegan'),
      allowNull: true,
      defaultValue: 'veg',
    })
  }
}
