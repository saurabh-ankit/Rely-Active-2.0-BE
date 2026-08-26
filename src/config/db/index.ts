import { Sequelize } from 'sequelize'
import { env } from '../env.js'

const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'mysql',
  logging: env.NODE_ENV === 'development' ? console.debug : false,
  pool: { max: 10, min: 0, acquire: 30_000, idle: 10_000 },
})

export default sequelize
