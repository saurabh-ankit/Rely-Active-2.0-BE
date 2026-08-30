import sequelize from '../src/config/db/index.js'

async function checkColumns() {
  try {
    const [resCols] = await sequelize.query(`DESCRIBE residents;`)
    console.log('--- RESIDENTS COLUMNS ---')
    console.log(resCols)

    const [fmCols] = await sequelize.query(`DESCRIBE resident_family_members;`)
    console.log('--- RESIDENT_FAMILY_MEMBERS COLUMNS ---')
    console.log(fmCols)

    process.exit(0)
  } catch (err) {
    console.error('Error describing tables:', err)
    process.exit(1)
  }
}

checkColumns()
