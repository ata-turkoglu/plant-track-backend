/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasAssetTypes = await knex.schema.hasTable('asset_types');
  const hasAssetTypeFields = await knex.schema.hasTable('asset_type_fields');
  if (!hasAssetTypes || !hasAssetTypeFields) return;

  const hasInputType = await knex.schema.hasColumn('asset_type_fields', 'input_type');
  const hasDataType = await knex.schema.hasColumn('asset_type_fields', 'data_type');

  if (hasInputType && !hasDataType) {
    await knex.schema.alterTable('asset_type_fields', (t) => {
      t.renameColumn('input_type', 'data_type');
    });
  }

  const nowHasDataType = await knex.schema.hasColumn('asset_type_fields', 'data_type');
  if (!nowHasDataType) return;

  await knex.raw('alter table asset_type_fields drop constraint if exists asset_type_fields_input_type_check');
  await knex.raw('alter table asset_type_fields drop constraint if exists asset_type_fields_data_type_check');
  await knex.raw(
    `alter table asset_type_fields
       add constraint asset_type_fields_data_type_check
       check (data_type in ('text','number','boolean','date'))`
  );

  const defaultFields = [
    { name: 'marka', label: 'Marka', aliases: ['brand'] },
    { name: 'model', label: 'Model' },
    { name: 'seri_no', label: 'Seri No', aliases: ['serial_no'] }
  ];

  const assetTypes = await knex('asset_types').select(['id', 'organization_id']);
  for (const assetType of assetTypes) {
    const existing = await knex('asset_type_fields')
      .where({ organization_id: assetType.organization_id, asset_type_id: assetType.id })
      .select(['name', 'sort_order']);

    const seen = new Set(existing.map((row) => String(row.name || '').toLowerCase()));
    let sortOrder = existing.reduce((max, row) => {
      const value = Number(row.sort_order);
      if (!Number.isFinite(value)) return max;
      return Math.max(max, value);
    }, -1);

    const rowsToInsert = [];
    for (const field of defaultFields) {
      const aliases = Array.isArray(field.aliases) ? field.aliases : [];
      const allNames = [field.name, ...aliases];
      if (allNames.some((name) => seen.has(String(name).toLowerCase()))) continue;
      sortOrder += 1;
      rowsToInsert.push({
        organization_id: assetType.organization_id,
        asset_type_id: assetType.id,
        name: field.name,
        label: field.label,
        data_type: 'text',
        required: false,
        unit_id: null,
        sort_order: sortOrder,
        active: true
      });
      for (const name of allNames) seen.add(String(name).toLowerCase());
    }

    if (rowsToInsert.length > 0) {
      await knex('asset_type_fields').insert(rowsToInsert);
    }
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasAssetTypeFields = await knex.schema.hasTable('asset_type_fields');
  if (!hasAssetTypeFields) return;

  const hasDataType = await knex.schema.hasColumn('asset_type_fields', 'data_type');
  const hasInputType = await knex.schema.hasColumn('asset_type_fields', 'input_type');

  if (hasDataType && !hasInputType) {
    await knex.schema.alterTable('asset_type_fields', (t) => {
      t.renameColumn('data_type', 'input_type');
    });
  }

  const nowHasInputType = await knex.schema.hasColumn('asset_type_fields', 'input_type');
  if (!nowHasInputType) return;

  await knex.raw('alter table asset_type_fields drop constraint if exists asset_type_fields_data_type_check');
  await knex.raw('alter table asset_type_fields drop constraint if exists asset_type_fields_input_type_check');
  await knex.raw(
    `alter table asset_type_fields
       add constraint asset_type_fields_input_type_check
       check (input_type in ('text','number','boolean','date'))`
  );
};
