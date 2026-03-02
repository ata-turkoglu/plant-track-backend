/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasInventoryItems = await knex.schema.hasTable('inventory_items');
  if (!hasInventoryItems) return;

  const hasAttributesJson = await knex.schema.hasColumn('inventory_items', 'attributes_json');
  if (hasAttributesJson) return;

  await knex.schema.alterTable('inventory_items', (t) => {
    t.jsonb('attributes_json').nullable();
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasInventoryItems = await knex.schema.hasTable('inventory_items');
  if (!hasInventoryItems) return;

  const hasAttributesJson = await knex.schema.hasColumn('inventory_items', 'attributes_json');
  if (!hasAttributesJson) return;

  await knex.schema.alterTable('inventory_items', (t) => {
    t.dropColumn('attributes_json');
  });
};
