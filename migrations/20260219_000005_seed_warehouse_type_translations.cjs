/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasWarehouseTypes = await knex.schema.hasTable('warehouse_types');
  const hasTranslations = await knex.schema.hasTable('translations');
  if (!hasWarehouseTypes || !hasTranslations) return;

  await knex.raw(
    `insert into translations (organization_id, namespace, entry_key, locale, value, created_at, updated_at)
     select wt.organization_id,
            'warehouse_type' as namespace,
            wt.code as entry_key,
            'tr' as locale,
            case
              when lower(wt.name) = 'urun' then 'Ürün'
              when lower(wt.name) = 'yedek parca' then 'Yedek Parça'
              else wt.name
            end as value,
            now(), now()
     from warehouse_types wt
     on conflict (organization_id, namespace, entry_key, locale) do nothing`
  );

  await knex.raw(
    `insert into translations (organization_id, namespace, entry_key, locale, value, created_at, updated_at)
     select wt.organization_id,
            'warehouse_type' as namespace,
            wt.code as entry_key,
            'en' as locale,
            case wt.code
              when 'RAW_MATERIAL' then 'Raw Material'
              when 'FINISHED_GOOD' then 'Finished Good'
              when 'SPARE_PART' then 'Spare Part'
              else wt.name
            end as value,
            now(), now()
     from warehouse_types wt
     on conflict (organization_id, namespace, entry_key, locale) do nothing`
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down() {
  // No-op: seeded rows may have been manually edited.
};
