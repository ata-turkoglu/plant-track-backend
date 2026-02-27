/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasAssetTypeFields = await knex.schema.hasTable('asset_type_fields');
  if (!hasAssetTypeFields) return;

  const hasIsDefault = await knex.schema.hasColumn('asset_type_fields', 'is_default');
  if (!hasIsDefault) {
    await knex.schema.alterTable('asset_type_fields', (t) => {
      t.boolean('is_default').notNullable().defaultTo(false);
    });
  }

  // Backfill known default fields (Marka/Model/Seri No) and common aliases.
  await knex('asset_type_fields')
    .whereRaw("lower(name) in ('marka','brand','model','seri_no','serial_no')")
    .update({ is_default: true });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasAssetTypeFields = await knex.schema.hasTable('asset_type_fields');
  if (!hasAssetTypeFields) return;

  const hasIsDefault = await knex.schema.hasColumn('asset_type_fields', 'is_default');
  if (hasIsDefault) {
    await knex.schema.alterTable('asset_type_fields', (t) => {
      t.dropColumn('is_default');
    });
  }
};

