const TABLES_WITH_ACTIVE = [
  'inventory_items',
  'inventory_item_cards',
  'inventory_item_card_fields',
  'firms',
  'assets',
  'asset_cards',
  'asset_card_fields'
];

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  for (const tableName of TABLES_WITH_ACTIVE) {
    const hasTable = await knex.schema.hasTable(tableName);
    if (!hasTable) continue;

    const hasActive = await knex.schema.hasColumn(tableName, 'active');
    if (!hasActive) continue;

    await knex.raw(`drop index if exists ${tableName}_organization_id_active_index`);
    await knex.schema.alterTable(tableName, (t) => {
      t.dropColumn('active');
    });
  }

  const hasProducts = await knex.schema.hasTable('products');
  if (hasProducts) {
    await knex.schema.dropTable('products');
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  for (const tableName of TABLES_WITH_ACTIVE) {
    const hasTable = await knex.schema.hasTable(tableName);
    if (!hasTable) continue;

    const hasActive = await knex.schema.hasColumn(tableName, 'active');
    if (hasActive) continue;

    await knex.schema.alterTable(tableName, (t) => {
      t.boolean('active').notNullable().defaultTo(true);
      t.index(['organization_id', 'active']);
    });
  }

  // products table is legacy-only; down migration does not recreate its old shape.
};
