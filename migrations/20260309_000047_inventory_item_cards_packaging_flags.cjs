/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasInventoryItemCards = await knex.schema.hasTable('inventory_item_cards');
  if (!hasInventoryItemCards) return;

  const hasIsPackagingMaterial = await knex.schema.hasColumn('inventory_item_cards', 'is_packaging_material');
  if (!hasIsPackagingMaterial) {
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.boolean('is_packaging_material').notNullable().defaultTo(false);
    });
  }

  const hasIsConsumable = await knex.schema.hasColumn('inventory_item_cards', 'is_consumable');
  if (!hasIsConsumable) {
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.boolean('is_consumable').notNullable().defaultTo(false);
    });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasInventoryItemCards = await knex.schema.hasTable('inventory_item_cards');
  if (!hasInventoryItemCards) return;

  const hasIsConsumable = await knex.schema.hasColumn('inventory_item_cards', 'is_consumable');
  if (hasIsConsumable) {
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.dropColumn('is_consumable');
    });
  }

  const hasIsPackagingMaterial = await knex.schema.hasColumn('inventory_item_cards', 'is_packaging_material');
  if (hasIsPackagingMaterial) {
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.dropColumn('is_packaging_material');
    });
  }
};
