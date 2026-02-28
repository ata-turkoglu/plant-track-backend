/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasInventoryItems = await knex.schema.hasTable('inventory_items');
  if (!hasInventoryItems) return;

  const hasOldColumn = await knex.schema.hasColumn('inventory_items', 'unit_id');
  const hasNewColumn = await knex.schema.hasColumn('inventory_items', 'amount_unit_id');
  if (hasOldColumn && !hasNewColumn) {
    await knex.schema.alterTable('inventory_items', (t) => {
      t.renameColumn('unit_id', 'amount_unit_id');
    });
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

  await renameConstraintIfExists('inventory_items_unit_id_foreign', 'inventory_items_amount_unit_id_foreign');
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasInventoryItems = await knex.schema.hasTable('inventory_items');
  if (!hasInventoryItems) return;

  const hasNewColumn = await knex.schema.hasColumn('inventory_items', 'amount_unit_id');
  const hasOldColumn = await knex.schema.hasColumn('inventory_items', 'unit_id');
  if (hasNewColumn && !hasOldColumn) {
    await knex.schema.alterTable('inventory_items', (t) => {
      t.renameColumn('amount_unit_id', 'unit_id');
    });
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

  await renameConstraintIfExists('inventory_items_amount_unit_id_foreign', 'inventory_items_unit_id_foreign');
};

