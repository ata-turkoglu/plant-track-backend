/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasLines = await knex.schema.hasTable('inventory_movement_lines');
  if (!hasLines) return;

  const hasUnitId = await knex.schema.hasColumn('inventory_movement_lines', 'unit_id');
  const hasAmountUnitId = await knex.schema.hasColumn('inventory_movement_lines', 'amount_unit_id');
  if (hasAmountUnitId) return;
  if (!hasUnitId) return;

  await knex.schema.table('inventory_movement_lines', (t) => {
    t.renameColumn('unit_id', 'amount_unit_id');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasLines = await knex.schema.hasTable('inventory_movement_lines');
  if (!hasLines) return;

  const hasUnitId = await knex.schema.hasColumn('inventory_movement_lines', 'unit_id');
  const hasAmountUnitId = await knex.schema.hasColumn('inventory_movement_lines', 'amount_unit_id');
  if (hasUnitId) return;
  if (!hasAmountUnitId) return;

  await knex.schema.table('inventory_movement_lines', (t) => {
    t.renameColumn('amount_unit_id', 'unit_id');
  });
};

