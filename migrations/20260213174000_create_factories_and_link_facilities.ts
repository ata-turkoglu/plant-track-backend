import type { Knex } from 'knex';

// Legacy migration kept as no-op after introducing organizations/organization_units.
export async function up(_knex: Knex): Promise<void> {
  return Promise.resolve();
}

export async function down(_knex: Knex): Promise<void> {
  return Promise.resolve();
}
