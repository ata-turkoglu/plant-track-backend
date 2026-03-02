/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('currencies');
  if (!hasTable) {
    await knex.schema.createTable('currencies', (t) => {
      t.increments('id').primary();

      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      t.string('code', 8).notNullable();
      t.string('name', 64).notNullable();
      t.string('symbol', 16).nullable();
      t.boolean('system').notNullable().defaultTo(true);
      t.boolean('active').notNullable().defaultTo(true);

      t.timestamps(true, true);

      t.unique(['organization_id', 'code']);
      t.index(['organization_id']);
      t.index(['organization_id', 'active']);
    });
  }

  // Seed commonly used currency codes for existing organizations.
  const hasOrgs = await knex.schema.hasTable('organizations');
  if (!hasOrgs) return;

  const orgIds = await knex('organizations').pluck('id');
  if (!Array.isArray(orgIds) || orgIds.length === 0) return;

  const seedCodes = ['TRY', 'USD', 'EUR', 'GBP'];
  const rows = orgIds.flatMap((organizationId) =>
    seedCodes.map((code) => ({
      organization_id: organizationId,
      code,
      name: code,
      symbol: null,
      system: true,
      active: true
    }))
  );

  await knex('currencies')
    .insert(rows)
    .onConflict(['organization_id', 'code'])
    .ignore();
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('currencies');
  if (!hasTable) return;
  await knex.schema.dropTable('currencies');
};

