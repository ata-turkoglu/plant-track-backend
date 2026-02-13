import knex from 'knex';
import { env } from '../config/env';

export const db = knex({
  client: 'pg',
  connection: {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    ssl: env.db.ssl ? { rejectUnauthorized: false } : false
  },
  pool: { min: 2, max: 10 }
});
