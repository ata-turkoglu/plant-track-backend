/** @type {import('knex').Knex.Config} */
const path = require('node:path');

module.exports = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'plant_track'
  },
  migrations: {
    directory: path.resolve(__dirname, process.env.KNEX_MIGRATIONS_DIR ?? 'migrations'),
    // Legacy migration dosyalari `migrations_legacy` klasorune tasindigi icin
    // mevcut DB'lerdeki eski kayitlar validation hatasi uretmesin.
    disableMigrationsListValidation: true
  }
};
