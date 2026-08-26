import 'dotenv/config'
import { Sequelize } from 'sequelize'

const dbName = process.env.DB_NAME || 'rely_active_new'
const dbUser = process.env.DB_USER || 'root'
const dbPass = process.env.DB_PASS || 'xelpmoc'
const dbHost = process.env.DB_HOST || 'localhost'
const dbPort = Number(process.env.DB_PORT) || 3306

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: 'mysql',
      logging: false,
      pool: { max: 10, min: 0, acquire: 30_000, idle: 10_000 },
    })
  : new Sequelize(dbName, dbUser, dbPass, {
      host: dbHost,
      port: dbPort,
      dialect: 'mysql',
      logging: false,
      pool: { max: 10, min: 0, acquire: 30_000, idle: 10_000 },
    })

export default sequelize
