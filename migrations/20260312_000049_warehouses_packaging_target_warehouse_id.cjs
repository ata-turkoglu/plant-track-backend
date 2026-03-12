/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasWarehouses = await knex.schema.hasTable('warehouses');
  if (!hasWarehouses) return;

  const hasColumn = await knex.schema.hasColumn('warehouses', 'packaging_target_warehouse_id');
  if (hasColumn) return;

  await knex.schema.alterTable('warehouses', (t) => {
    t
      .integer('packaging_target_warehouse_id')
      .nullable()
      .references('id')
      .inTable('warehouses')
      .onDelete('SET NULL');
    t.index(['packaging_target_warehouse_id']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasWarehouses = await knex.schema.hasTable('warehouses');
  if (!hasWarehouses) return;

  const hasColumn = await knex.schema.hasColumn('warehouses', 'packaging_target_warehouse_id');
  if (!hasColumn) return;

  await knex.schema.alterTable('warehouses', (t) => {
    t.dropIndex(['packaging_target_warehouse_id']);
    t.dropColumn('packaging_target_warehouse_id');
  });
};
