/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasInventoryItemCards = await knex.schema.hasTable('inventory_item_cards');
  if (!hasInventoryItemCards) return;

  const hasMaterialRole = await knex.schema.hasColumn('inventory_item_cards', 'material_role');
  if (!hasMaterialRole) {
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.string('material_role', 16).notNullable().defaultTo('NORMAL');
    });
  }

  const hasIsPackagingMaterial = await knex.schema.hasColumn('inventory_item_cards', 'is_packaging_material');
  const hasIsConsumable = await knex.schema.hasColumn('inventory_item_cards', 'is_consumable');

  if (hasIsPackagingMaterial || hasIsConsumable) {
    await knex.raw(`
      update inventory_item_cards
      set material_role = case
        when coalesce(is_packaging_material, false) then 'PACKAGING'
        when coalesce(is_consumable, false) then 'CONSUMABLE'
        else 'NORMAL'
      end
    `);
  }

  await knex.raw('alter table inventory_item_cards drop constraint if exists inventory_item_cards_material_role_check');
  await knex.raw(
    "alter table inventory_item_cards add constraint inventory_item_cards_material_role_check check (material_role in ('NORMAL','PACKAGING','CONSUMABLE'))"
  );

  if (hasIsConsumable) {
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.dropColumn('is_consumable');
    });
  }

  if (hasIsPackagingMaterial) {
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.dropColumn('is_packaging_material');
    });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
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

  const hasMaterialRole = await knex.schema.hasColumn('inventory_item_cards', 'material_role');
  if (hasMaterialRole) {
    await knex.raw(`
      update inventory_item_cards
      set
        is_packaging_material = (material_role = 'PACKAGING'),
        is_consumable = (material_role = 'CONSUMABLE')
    `);
    await knex.raw('alter table inventory_item_cards drop constraint if exists inventory_item_cards_material_role_check');
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.dropColumn('material_role');
    });
  }
};
