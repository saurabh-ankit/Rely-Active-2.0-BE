import sequelize from '../src/config/db/index.js'

async function run() {
  try {
    const [cols] = await sequelize.query(`SHOW COLUMNS FROM resident_family_members LIKE 'dob';`)
    if (Array.isArray(cols) && cols.length > 0) {
      console.log('✅ Column dob already exists in resident_family_members table.')
    } else {
      await sequelize.query(`
        ALTER TABLE resident_family_members
        ADD COLUMN dob DATE NULL AFTER gender;
      `)
      console.log('🎉 Added column dob to resident_family_members table successfully!')
    }
    process.exit(0)
  } catch (err) {
    console.error('Error adding column dob:', err)
    process.exit(1)
  }
}

run()
