exports.config = { transaction: false };

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasAssets = await knex.schema.hasTable('assets');
  if (!hasAssets) return;

  const hasAttributes = await knex.schema.hasColumn('assets', 'attributes_json');
  if (!hasAttributes) return;

  await knex.raw(`
    create index concurrently if not exists assets_attributes_json_gin_idx
      on assets using gin (attributes_json jsonb_path_ops)
      where attributes_json is not null
  `);

  // Common default fields: marka/model/seri_no.
  // Composite with organization_id keeps lookups tenant-scoped.
  await knex.raw(`
    create index concurrently if not exists assets_org_attr_marka_idx
      on assets (organization_id, lower(attributes_json->>'marka'))
      where jsonb_exists(attributes_json, 'marka')
  `);

  await knex.raw(`
    create index concurrently if not exists assets_org_attr_model_idx
      on assets (organization_id, lower(attributes_json->>'model'))
      where jsonb_exists(attributes_json, 'model')
  `);

  await knex.raw(`
    create index concurrently if not exists assets_org_attr_seri_no_idx
      on assets (organization_id, lower(attributes_json->>'seri_no'))
      where jsonb_exists(attributes_json, 'seri_no')
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('drop index concurrently if exists assets_org_attr_seri_no_idx');
  await knex.raw('drop index concurrently if exists assets_org_attr_model_idx');
  await knex.raw('drop index concurrently if exists assets_org_attr_marka_idx');
  await knex.raw('drop index concurrently if exists assets_attributes_json_gin_idx');
};
