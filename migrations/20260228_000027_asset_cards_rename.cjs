/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasAssetCards = await knex.schema.hasTable('asset_cards');
  const hasAssetTypes = await knex.schema.hasTable('asset_types');
  if (!hasAssetCards && hasAssetTypes) {
    await knex.schema.renameTable('asset_types', 'asset_cards');
  }

  const hasAssetCardFields = await knex.schema.hasTable('asset_card_fields');
  const hasAssetTypeFields = await knex.schema.hasTable('asset_type_fields');
  if (!hasAssetCardFields && hasAssetTypeFields) {
    await knex.schema.renameTable('asset_type_fields', 'asset_card_fields');
  }

  const hasAssets = await knex.schema.hasTable('assets');
  if (hasAssets) {
    const hasOldColumn = await knex.schema.hasColumn('assets', 'asset_type_id');
    const hasNewColumn = await knex.schema.hasColumn('assets', 'asset_card_id');
    if (hasOldColumn && !hasNewColumn) {
      await knex.schema.alterTable('assets', (t) => {
        t.renameColumn('asset_type_id', 'asset_card_id');
      });
    }
  }

  const hasFields = await knex.schema.hasTable('asset_card_fields');
  if (hasFields) {
    const hasOldColumn = await knex.schema.hasColumn('asset_card_fields', 'asset_type_id');
    const hasNewColumn = await knex.schema.hasColumn('asset_card_fields', 'asset_card_id');
    if (hasOldColumn && !hasNewColumn) {
      await knex.schema.alterTable('asset_card_fields', (t) => {
        t.renameColumn('asset_type_id', 'asset_card_id');
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

  // Best-effort: constraint renames (Postgres doesn't auto-rename constraint names on table/column rename).
  await renameConstraintIfExists('asset_types_organization_id_foreign', 'asset_cards_organization_id_foreign');
  await renameConstraintIfExists('asset_type_fields_organization_id_foreign', 'asset_card_fields_organization_id_foreign');
  await renameConstraintIfExists('asset_type_fields_asset_type_id_foreign', 'asset_card_fields_asset_card_id_foreign');
  await renameConstraintIfExists('asset_type_fields_unit_id_foreign', 'asset_card_fields_unit_id_foreign');
  await renameConstraintIfExists('assets_asset_type_id_foreign', 'assets_asset_card_id_foreign');
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasAssets = await knex.schema.hasTable('assets');
  if (hasAssets) {
    const hasNewColumn = await knex.schema.hasColumn('assets', 'asset_card_id');
    const hasOldColumn = await knex.schema.hasColumn('assets', 'asset_type_id');
    if (hasNewColumn && !hasOldColumn) {
      await knex.schema.alterTable('assets', (t) => {
        t.renameColumn('asset_card_id', 'asset_type_id');
      });
    }
  }

  const hasFields = await knex.schema.hasTable('asset_card_fields');
  if (hasFields) {
    const hasNewColumn = await knex.schema.hasColumn('asset_card_fields', 'asset_card_id');
    const hasOldColumn = await knex.schema.hasColumn('asset_card_fields', 'asset_type_id');
    if (hasNewColumn && !hasOldColumn) {
      await knex.schema.alterTable('asset_card_fields', (t) => {
        t.renameColumn('asset_card_id', 'asset_type_id');
      });
    }
  }

  const hasAssetTypes = await knex.schema.hasTable('asset_types');
  const hasAssetCards = await knex.schema.hasTable('asset_cards');
  if (!hasAssetTypes && hasAssetCards) {
    await knex.schema.renameTable('asset_cards', 'asset_types');
  }

  const hasAssetTypeFields = await knex.schema.hasTable('asset_type_fields');
  const hasAssetCardFields = await knex.schema.hasTable('asset_card_fields');
  if (!hasAssetTypeFields && hasAssetCardFields) {
    await knex.schema.renameTable('asset_card_fields', 'asset_type_fields');
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

  await renameConstraintIfExists('asset_cards_organization_id_foreign', 'asset_types_organization_id_foreign');
  await renameConstraintIfExists('asset_card_fields_organization_id_foreign', 'asset_type_fields_organization_id_foreign');
  await renameConstraintIfExists('asset_card_fields_asset_card_id_foreign', 'asset_type_fields_asset_type_id_foreign');
  await renameConstraintIfExists('asset_card_fields_unit_id_foreign', 'asset_type_fields_unit_id_foreign');
  await renameConstraintIfExists('assets_asset_card_id_foreign', 'assets_asset_type_id_foreign');
};

