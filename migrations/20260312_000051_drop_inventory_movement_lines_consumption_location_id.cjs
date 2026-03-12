/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasLines = await knex.schema.hasTable('inventory_movement_lines');
  if (!hasLines) return;

  await knex.raw('alter table inventory_movement_lines drop column if exists consumption_location_id cascade');
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasLines = await knex.schema.hasTable('inventory_movement_lines');
  if (!hasLines) return;

  const hasColumn = await knex.schema.hasColumn('inventory_movement_lines', 'consumption_location_id');
  if (hasColumn) return;

  await knex.schema.alterTable('inventory_movement_lines', (t) => {
    t.integer('consumption_location_id').nullable();
  });
};
