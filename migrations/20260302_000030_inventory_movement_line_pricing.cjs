/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasLines = await knex.schema.hasTable('inventory_movement_lines');
  if (!hasLines) return;

  const hasUnitPrice = await knex.schema.hasColumn('inventory_movement_lines', 'unit_price');
  if (!hasUnitPrice) {
    await knex.schema.alterTable('inventory_movement_lines', (t) => {
      t.decimal('unit_price', 18, 6).nullable();
    });
  }

  const hasCurrencyCode = await knex.schema.hasColumn('inventory_movement_lines', 'currency_code');
  if (!hasCurrencyCode) {
    await knex.schema.alterTable('inventory_movement_lines', (t) => {
      t.string('currency_code', 8).nullable();
    });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasLines = await knex.schema.hasTable('inventory_movement_lines');
  if (!hasLines) return;

  const hasUnitPrice = await knex.schema.hasColumn('inventory_movement_lines', 'unit_price');
  const hasCurrencyCode = await knex.schema.hasColumn('inventory_movement_lines', 'currency_code');
  if (!hasUnitPrice && !hasCurrencyCode) return;

  await knex.schema.alterTable('inventory_movement_lines', (t) => {
    if (hasUnitPrice) t.dropColumn('unit_price');
    if (hasCurrencyCode) t.dropColumn('currency_code');
  });
};

