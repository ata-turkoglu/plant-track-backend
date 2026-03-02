/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasUnits = await knex.schema.hasTable('units');
  if (hasUnits) {
    const hasUnitsActive = await knex.schema.hasColumn('units', 'active');
    if (hasUnitsActive) {
      await knex.raw('drop index if exists units_organization_id_active_index');
      await knex.schema.alterTable('units', (t) => {
        t.dropColumn('active');
      });
    }
  }

  const hasCurrencies = await knex.schema.hasTable('currencies');
  if (hasCurrencies) {
    const hasCurrenciesActive = await knex.schema.hasColumn('currencies', 'active');
    if (hasCurrenciesActive) {
      await knex.raw('drop index if exists currencies_organization_id_active_index');
      await knex.schema.alterTable('currencies', (t) => {
        t.dropColumn('active');
      });
    }
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasUnits = await knex.schema.hasTable('units');
  if (hasUnits) {
    const hasUnitsActive = await knex.schema.hasColumn('units', 'active');
    if (!hasUnitsActive) {
      await knex.schema.alterTable('units', (t) => {
        t.boolean('active').notNullable().defaultTo(true);
        t.index(['organization_id', 'active']);
      });
    }
  }

  const hasCurrencies = await knex.schema.hasTable('currencies');
  if (hasCurrencies) {
    const hasCurrenciesActive = await knex.schema.hasColumn('currencies', 'active');
    if (!hasCurrenciesActive) {
      await knex.schema.alterTable('currencies', (t) => {
        t.boolean('active').notNullable().defaultTo(true);
        t.index(['organization_id', 'active']);
      });
    }
  }
};
