/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasCol = await knex.schema.hasColumn('inventory_movements', 'movement_group_id');
  if (!hasCol) {
    await knex.schema.alterTable('inventory_movements', (t) => {
      t.string('movement_group_id', 64).nullable();
      t.index(['organization_id', 'movement_group_id']);
    });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasCol = await knex.schema.hasColumn('inventory_movements', 'movement_group_id');
  if (hasCol) {
    await knex.schema.alterTable('inventory_movements', (t) => {
      t.dropIndex(['organization_id', 'movement_group_id']);
      t.dropColumn('movement_group_id');
    });
  }
};

