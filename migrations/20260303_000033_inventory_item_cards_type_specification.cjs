/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasInventoryItemCards = await knex.schema.hasTable('inventory_item_cards');
  if (!hasInventoryItemCards) return;

  const hasTypeSpec = await knex.schema.hasColumn('inventory_item_cards', 'type_spec');
  const hasTypeName = await knex.schema.hasColumn('inventory_item_cards', 'type_name');
  if (hasTypeSpec && !hasTypeName) {
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.renameColumn('type_spec', 'type_name');
    });
  }

  const hasSizeSpec = await knex.schema.hasColumn('inventory_item_cards', 'size_spec');
  const hasSpecification = await knex.schema.hasColumn('inventory_item_cards', 'specification');
  if (hasSizeSpec && !hasSpecification) {
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.renameColumn('size_spec', 'specification');
    });
  }

  const hasSizeUnitId = await knex.schema.hasColumn('inventory_item_cards', 'size_unit_id');
  if (hasSizeUnitId) {
    await knex.raw('drop index if exists inventory_item_cards_size_unit_id_index');
    await knex.raw('alter table inventory_item_cards drop constraint if exists inventory_item_cards_size_unit_id_foreign');
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.dropColumn('size_unit_id');
    });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasInventoryItemCards = await knex.schema.hasTable('inventory_item_cards');
  if (!hasInventoryItemCards) return;

  const hasSizeUnitId = await knex.schema.hasColumn('inventory_item_cards', 'size_unit_id');
  if (!hasSizeUnitId) {
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.integer('size_unit_id').nullable().references('id').inTable('units').onDelete('RESTRICT');
      t.index(['size_unit_id']);
    });
  }

  const hasSpecification = await knex.schema.hasColumn('inventory_item_cards', 'specification');
  const hasSizeSpec = await knex.schema.hasColumn('inventory_item_cards', 'size_spec');
  if (hasSpecification && !hasSizeSpec) {
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.renameColumn('specification', 'size_spec');
    });
  }

  const hasTypeName = await knex.schema.hasColumn('inventory_item_cards', 'type_name');
  const hasTypeSpec = await knex.schema.hasColumn('inventory_item_cards', 'type_spec');
  if (hasTypeName && !hasTypeSpec) {
    await knex.schema.alterTable('inventory_item_cards', (t) => {
      t.renameColumn('type_name', 'type_spec');
    });
  }
};
