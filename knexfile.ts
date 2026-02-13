import type { Knex } from 'knex';
import dotenv from 'dotenv';

dotenv.config();

const dbPort = Number(process.env.DB_PORT || 5432);
const dbSsl = process.env.DB_SSL === 'true';

const baseConnection = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: dbPort,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'plant_track',
  ssl: dbSsl ? { rejectUnauthorized: false } : false
};

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: baseConnection,
    migrations: {
      directory: './migrations',
      extension: 'ts'
    }
  },
  production: {
    client: 'pg',
    connection: baseConnection,
    migrations: {
      directory: './migrations',
      extension: 'ts'
    },
    pool: { min: 2, max: 10 }
  }
};

export default config;
module.exports = config;
