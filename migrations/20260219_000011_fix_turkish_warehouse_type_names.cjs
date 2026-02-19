/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasWarehouseTypes = await knex.schema.hasTable('warehouse_types');
  if (!hasWarehouseTypes) return;

  await knex.raw(`
    with mapping (old_code, new_code, new_name) as (
      values
        ('RAW_MATERIAL', 'raw_material', 'Raw Material'),
        ('SPARE_PART', 'spare_part', 'Spare Part'),
        ('FINISHED_GOOD', 'finished_good', 'Finished Good')
    )
    update warehouse_types wt
    set
      code = m.new_code,
      name = m.new_name,
      updated_at = now()
    from mapping m
    where upper(wt.code) = m.old_code
  `);

  const hasTranslations = await knex.schema.hasTable('translations');
  if (!hasTranslations) return;

  const hasTrColumn = await knex.schema.hasColumn('translations', 'tr');
  const hasEnColumn = await knex.schema.hasColumn('translations', 'en');
  if (!hasTrColumn || !hasEnColumn) return;

  await knex.raw(`
    with mapping (old_key, new_key) as (
      values
        ('RAW_MATERIAL', 'raw_material'),
        ('SPARE_PART', 'spare_part'),
        ('FINISHED_GOOD', 'finished_good')
    )
    insert into translations (organization_id, namespace, entry_key, tr, en, created_at, updated_at)
    select
      t.organization_id,
      t.namespace,
      m.new_key,
      t.tr,
      t.en,
      t.created_at,
      t.updated_at
    from translations t
    join mapping m on m.old_key = t.entry_key
    where t.namespace = 'warehouse_type'
    on conflict (organization_id, namespace, entry_key) do update
    set
      tr = case
        when coalesce(translations.tr, '') = '' then excluded.tr
        else translations.tr
      end,
      en = case
        when coalesce(translations.en, '') = '' then excluded.en
        else translations.en
      end,
      updated_at = now()
  `);

  await knex.raw(`
    delete from translations
    where namespace = 'warehouse_type'
      and entry_key in ('RAW_MATERIAL', 'SPARE_PART', 'FINISHED_GOOD')
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down() {
  // No-op: normalized warehouse type codes/names should remain canonical.
};
