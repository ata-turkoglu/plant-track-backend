/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasInventoryItemCards = await knex.schema.hasTable('inventory_item_cards');
  const hasInventoryItems = await knex.schema.hasTable('inventory_items');

  const hasItemGroups = await knex.schema.hasTable('item_groups');
  const hasItems = await knex.schema.hasTable('items');

  if (!hasInventoryItemCards && hasItemGroups) {
    await knex.schema.renameTable('item_groups', 'inventory_item_cards');
  }

  if (!hasInventoryItems && hasItems) {
    await knex.schema.renameTable('items', 'inventory_items');
  }

  const nowHasInventoryItems = await knex.schema.hasTable('inventory_items');
  if (nowHasInventoryItems) {
    const hasOldColumn = await knex.schema.hasColumn('inventory_items', 'item_group_id');
    const hasNewColumn = await knex.schema.hasColumn('inventory_items', 'inventory_item_card_id');
    if (hasOldColumn && !hasNewColumn) {
      await knex.schema.alterTable('inventory_items', (t) => {
        t.renameColumn('item_group_id', 'inventory_item_card_id');
      });
    }
  }

  const hasMovementLines = await knex.schema.hasTable('inventory_movement_lines');
  if (hasMovementLines) {
    const hasOldColumn = await knex.schema.hasColumn('inventory_movement_lines', 'item_id');
    const hasNewColumn = await knex.schema.hasColumn('inventory_movement_lines', 'inventory_item_id');
    if (hasOldColumn && !hasNewColumn) {
      await knex.schema.alterTable('inventory_movement_lines', (t) => {
        t.renameColumn('item_id', 'inventory_item_id');
      });
    }
  }

  const hasBomLines = await knex.schema.hasTable('asset_bom_lines');
  if (hasBomLines) {
    const hasOldColumn = await knex.schema.hasColumn('asset_bom_lines', 'item_group_id');
    const hasNewColumn = await knex.schema.hasColumn('asset_bom_lines', 'inventory_item_card_id');
    if (hasOldColumn && !hasNewColumn) {
      await knex.schema.alterTable('asset_bom_lines', (t) => {
        t.renameColumn('item_group_id', 'inventory_item_card_id');
      });
    }
  }

  async function renameConstraintIfExists(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    try {
      const lookup = await knex.raw(
        `
        select
          con.conname as name,
          rel.relname as table_name
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        where con.conname = ?
        limit 1
        `,
        [oldName]
      );
      const row = Array.isArray(lookup?.rows) ? lookup.rows[0] : null;
      const tableName = row?.table_name;
      if (!tableName) return;

      const alreadyRows = await knex.raw(`select 1 as ok from pg_constraint where conname = ? limit 1`, [newName]);
      const already = Array.isArray(alreadyRows?.rows) ? alreadyRows.rows.length > 0 : false;
      if (already) return;

      await knex.raw('alter table ?? rename constraint ?? to ??', [tableName, oldName, newName]);
    } catch {
      // best-effort
    }
  }

  // Best-effort: rename FK constraint names to match new table/column names (Postgres doesn't auto-rename them).
  await renameConstraintIfExists('item_groups_organization_id_foreign', 'inventory_item_cards_organization_id_foreign');
  await renameConstraintIfExists('item_groups_warehouse_type_id_foreign', 'inventory_item_cards_warehouse_type_id_foreign');
  await renameConstraintIfExists('item_groups_amount_unit_id_foreign', 'inventory_item_cards_amount_unit_id_foreign');
  await renameConstraintIfExists('item_groups_size_unit_id_foreign', 'inventory_item_cards_size_unit_id_foreign');

  await renameConstraintIfExists('items_organization_id_foreign', 'inventory_items_organization_id_foreign');
  await renameConstraintIfExists('items_warehouse_type_id_foreign', 'inventory_items_warehouse_type_id_foreign');
  await renameConstraintIfExists('items_unit_id_foreign', 'inventory_items_unit_id_foreign');
  await renameConstraintIfExists('items_item_group_id_foreign', 'inventory_items_inventory_item_card_id_foreign');

  await renameConstraintIfExists('inventory_movement_lines_item_id_foreign', 'inventory_movement_lines_inventory_item_id_foreign');
  await renameConstraintIfExists('asset_bom_lines_item_group_id_foreign', 'asset_bom_lines_inventory_item_card_id_foreign');
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasItems = await knex.schema.hasTable('items');
  const hasItemGroups = await knex.schema.hasTable('item_groups');

  const hasInventoryItemCards = await knex.schema.hasTable('inventory_item_cards');
  const hasInventoryItems = await knex.schema.hasTable('inventory_items');

  const hasMovementLines = await knex.schema.hasTable('inventory_movement_lines');
  if (hasMovementLines) {
    const hasNewColumn = await knex.schema.hasColumn('inventory_movement_lines', 'inventory_item_id');
    const hasOldColumn = await knex.schema.hasColumn('inventory_movement_lines', 'item_id');
    if (hasNewColumn && !hasOldColumn) {
      await knex.schema.alterTable('inventory_movement_lines', (t) => {
        t.renameColumn('inventory_item_id', 'item_id');
      });
    }
  }

  const hasBomLines = await knex.schema.hasTable('asset_bom_lines');
  if (hasBomLines) {
    const hasNewColumn = await knex.schema.hasColumn('asset_bom_lines', 'inventory_item_card_id');
    const hasOldColumn = await knex.schema.hasColumn('asset_bom_lines', 'item_group_id');
    if (hasNewColumn && !hasOldColumn) {
      await knex.schema.alterTable('asset_bom_lines', (t) => {
        t.renameColumn('inventory_item_card_id', 'item_group_id');
      });
    }
  }

  if (hasInventoryItems) {
    const hasNewColumn = await knex.schema.hasColumn('inventory_items', 'inventory_item_card_id');
    const hasOldColumn = await knex.schema.hasColumn('inventory_items', 'item_group_id');
    if (hasNewColumn && !hasOldColumn) {
      await knex.schema.alterTable('inventory_items', (t) => {
        t.renameColumn('inventory_item_card_id', 'item_group_id');
      });
    }
  }

  if (!hasItems && hasInventoryItems) {
    await knex.schema.renameTable('inventory_items', 'items');
  }

  if (!hasItemGroups && hasInventoryItemCards) {
    await knex.schema.renameTable('inventory_item_cards', 'item_groups');
  }

  async function renameConstraintIfExists(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    try {
      const lookup = await knex.raw(
        `
        select
          con.conname as name,
          rel.relname as table_name
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        where con.conname = ?
        limit 1
        `,
        [oldName]
      );
      const row = Array.isArray(lookup?.rows) ? lookup.rows[0] : null;
      const tableName = row?.table_name;
      if (!tableName) return;

      const alreadyRows = await knex.raw(`select 1 as ok from pg_constraint where conname = ? limit 1`, [newName]);
      const already = Array.isArray(alreadyRows?.rows) ? alreadyRows.rows.length > 0 : false;
      if (already) return;

      await knex.raw('alter table ?? rename constraint ?? to ??', [tableName, oldName, newName]);
    } catch {
      // best-effort
    }
  }

  await renameConstraintIfExists('inventory_item_cards_organization_id_foreign', 'item_groups_organization_id_foreign');
  await renameConstraintIfExists('inventory_item_cards_warehouse_type_id_foreign', 'item_groups_warehouse_type_id_foreign');
  await renameConstraintIfExists('inventory_item_cards_amount_unit_id_foreign', 'item_groups_amount_unit_id_foreign');
  await renameConstraintIfExists('inventory_item_cards_size_unit_id_foreign', 'item_groups_size_unit_id_foreign');

  await renameConstraintIfExists('inventory_items_organization_id_foreign', 'items_organization_id_foreign');
  await renameConstraintIfExists('inventory_items_warehouse_type_id_foreign', 'items_warehouse_type_id_foreign');
  await renameConstraintIfExists('inventory_items_unit_id_foreign', 'items_unit_id_foreign');
  await renameConstraintIfExists('inventory_items_inventory_item_card_id_foreign', 'items_item_group_id_foreign');

  await renameConstraintIfExists('inventory_movement_lines_inventory_item_id_foreign', 'inventory_movement_lines_item_id_foreign');
  await renameConstraintIfExists('asset_bom_lines_inventory_item_card_id_foreign', 'asset_bom_lines_item_group_id_foreign');
};
