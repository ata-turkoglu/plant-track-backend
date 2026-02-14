/* eslint-disable no-console */
const { Client } = require('pg');

async function main() {
  const host = process.env.DB_HOST ?? '127.0.0.1';
  const port = Number(process.env.DB_PORT ?? 5432);
  const user = process.env.DB_USER ?? 'postgres';
  const password = process.env.DB_PASSWORD ?? 'postgres';
  const targetDb = process.env.DB_NAME ?? 'plant_track';

  // Connect to maintenance DB to create the target DB if missing.
  const client = new Client({
    host,
    port,
    user,
    password,
    database: process.env.DB_MAINT_DB ?? 'postgres'
  });

  await client.connect();
  try {
    const existsRes = await client.query('select 1 from pg_database where datname = $1', [targetDb]);
    if (existsRes.rowCount > 0) {
      console.log(`Database already exists: ${targetDb}`);
      return;
    }

    // Identifiers can't be parameterized, so we quote defensively.
    const safeName = `"${String(targetDb).replaceAll('"', '""')}"`;
    await client.query(`create database ${safeName}`);
    console.log(`Database created: ${targetDb}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Failed to create database.');
  console.error(err?.message ?? err);
  process.exit(1);
});
