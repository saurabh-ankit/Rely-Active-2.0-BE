import sequelize from '../src/config/db/index.js'

async function run() {
  try {
    const [cols] = await sequelize.query(`SHOW COLUMNS FROM resident_family_members LIKE 'isResiding';`)
    if (Array.isArray(cols) && cols.length > 0) {
      console.log('✅ Column isResiding already exists in resident_family_members table.')
    } else {
      await sequelize.query(`
        ALTER TABLE resident_family_members
        ADD COLUMN isResiding TINYINT(1) NOT NULL DEFAULT 1 AFTER relation;
      `)
      console.log('🎉 Added column isResiding to resident_family_members table successfully!')
    }
    process.exit(0)
  } catch (err) {
    console.error('Error adding column to resident_family_members:', err)
    process.exit(1)
  }
}

run()
