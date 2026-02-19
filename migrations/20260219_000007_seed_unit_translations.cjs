/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasUnits = await knex.schema.hasTable('units');
  const hasTranslations = await knex.schema.hasTable('translations');
  if (!hasUnits || !hasTranslations) return;

  await knex.raw(`
    insert into translations (organization_id, namespace, entry_key, tr, en, created_at, updated_at)
    select
      u.organization_id,
      'unit' as namespace,
      lower(u.code) as entry_key,
      case lower(u.code)
        when 'kg' then 'Kilogram'
        when 'g' then 'Gram'
        when 't' then 'Ton'
        when 'l' then 'Litre'
        when 'ml' then 'Mililitre'
        when 'm' then 'Metre'
        when 'cm' then 'Santimetre'
        when 'mm' then 'Milimetre'
        when 'pcs' then 'Adet'
        when 'piece' then 'Adet'
        when 'adet' then 'Adet'
        else u.name
      end as tr,
      case lower(u.code)
        when 'kg' then 'Kilogram'
        when 'g' then 'Gram'
        when 't' then 'Ton'
        when 'l' then 'Liter'
        when 'ml' then 'Milliliter'
        when 'm' then 'Meter'
        when 'cm' then 'Centimeter'
        when 'mm' then 'Millimeter'
        when 'pcs' then 'Piece'
        when 'piece' then 'Piece'
        when 'adet' then 'Piece'
        when 'micron' then 'Micron'
        when 'mesh' then 'Mesh'
        else u.name
      end as en,
      now(), now()
    from units u
    on conflict (organization_id, namespace, entry_key)
    do update set
      tr = excluded.tr,
      en = excluded.en,
      updated_at = now()
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasTranslations = await knex.schema.hasTable('translations');
  if (!hasTranslations) return;

  await knex('translations').where({ namespace: 'unit' }).del();
};
