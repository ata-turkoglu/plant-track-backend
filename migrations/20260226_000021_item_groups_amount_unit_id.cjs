/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasGroups = await knex.schema.hasTable('item_groups');
  if (!hasGroups) return;

  const hasUnitId = await knex.schema.hasColumn('item_groups', 'unit_id');
  const hasAmountUnitId = await knex.schema.hasColumn('item_groups', 'amount_unit_id');
  if (hasAmountUnitId) return;
  if (!hasUnitId) return;

  await knex.schema.table('item_groups', (t) => {
    t.renameColumn('unit_id', 'amount_unit_id');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasGroups = await knex.schema.hasTable('item_groups');
  if (!hasGroups) return;

  const hasUnitId = await knex.schema.hasColumn('item_groups', 'unit_id');
  const hasAmountUnitId = await knex.schema.hasColumn('item_groups', 'amount_unit_id');
  if (hasUnitId) return;
  if (!hasAmountUnitId) return;

  await knex.schema.table('item_groups', (t) => {
    t.renameColumn('amount_unit_id', 'unit_id');
  });
};

