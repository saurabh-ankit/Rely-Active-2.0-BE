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

  if (!tables.includes('medical_specializations')) {
    await queryInterface.createTable('medical_specializations', {
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
      category: {
        type: DataTypes.ENUM('DOCTOR', 'NURSE', 'ALL', 'OTHER'),
        allowNull: false,
        defaultValue: 'ALL',
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
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    })

    // Seed default medical specializations
    await queryInterface.bulkInsert('medical_specializations', [
      {
        id: '11111111-1111-4111-a111-111111111111',
        name: 'Geriatric Medicine',
        code: 'GERIATRICS',
        category: 'DOCTOR',
        description: 'Elderly care & dementia management',
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '22222222-2222-4222-a222-222222222222',
        name: 'Cardiology',
        code: 'CARDIOLOGY',
        category: 'DOCTOR',
        description: 'Cardiovascular healthcare',
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '33333333-3333-4333-a333-333333333333',
        name: 'Neurology',
        code: 'NEUROLOGY',
        category: 'DOCTOR',
        description: 'Brain & memory disorders',
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '44444444-4444-4444-a444-444444444444',
        name: 'General Practice',
        code: 'GP',
        category: 'DOCTOR',
        description: 'Primary health consultations',
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '55555555-5555-4555-a555-555555555555',
        name: 'Palliative Nursing',
        code: 'PALLIATIVE',
        category: 'NURSE',
        description: 'Comfort & long-term palliative care',
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '66666666-6666-4666-a666-666666666666',
        name: 'ICU & Critical Care',
        code: 'CRITICAL_CARE',
        category: 'NURSE',
        description: 'High dependency unit support',
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '77777777-7777-4777-a777-777777777777',
        name: 'Memory Care & ADL',
        code: 'MEMORY_CARE',
        category: 'ALL',
        description: 'Assisted living & resident caregiver',
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '88888888-8888-4888-a888-888888888888',
        name: 'Physiotherapy & Wellness',
        code: 'PHYSIO',
        category: 'ALL',
        description: 'Physical rehabilitation & mobility',
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
  }
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.dropTable('medical_specializations')
}
