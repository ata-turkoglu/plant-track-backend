import db from '../db/knex.js';

const ASSET_TYPE_COLUMNS = ['id', 'organization_id', 'code', 'name', 'active', 'created_at', 'updated_at'];
const ASSET_TYPE_FIELD_COLUMNS = [
  'id',
  'organization_id',
  'asset_type_id',
  'name',
  'label',
  'input_type',
  'required',
  'unit_id',
  'sort_order',
  'active',
  'created_at',
  'updated_at'
];

function attachFields(assetTypes, fieldRows) {
  const grouped = new Map();

  for (const field of fieldRows) {
    const list = grouped.get(field.asset_type_id) ?? [];
    list.push(field);
    grouped.set(field.asset_type_id, list);
  }

  return assetTypes.map((row) => ({
    ...row,
    fields: grouped.get(row.id) ?? []
  }));
}

async function listAssetTypeFieldsByIds(dbOrTrx, organizationId, assetTypeIds) {
  if (assetTypeIds.length === 0) return [];

  return dbOrTrx('asset_type_fields')
    .where({ organization_id: organizationId })
    .whereIn('asset_type_id', assetTypeIds)
    .select(ASSET_TYPE_FIELD_COLUMNS)
    .orderBy([
      { column: 'asset_type_id', order: 'asc' },
      { column: 'sort_order', order: 'asc' },
      { column: 'id', order: 'asc' }
    ]);
}

async function replaceAssetTypeFields(trx, { organizationId, assetTypeId, fields }) {
  await trx('asset_type_fields').where({ organization_id: organizationId, asset_type_id: assetTypeId }).del();

  if (!Array.isArray(fields) || fields.length === 0) return [];

  const rows = await trx('asset_type_fields')
    .insert(
      fields.map((field, index) => ({
        organization_id: organizationId,
        asset_type_id: assetTypeId,
        name: field.name,
        label: field.label,
        input_type: field.inputType,
        required: field.required,
        unit_id: field.unitId,
        sort_order: Number.isFinite(field.sortOrder) ? field.sortOrder : index,
        active: field.active ?? true
      }))
    )
    .returning(ASSET_TYPE_FIELD_COLUMNS);

  return rows.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
}

export async function listAssetTypesByOrganization(organizationId, { active, q, code, name, hasSchema } = {}) {
  const query = db('asset_types')
    .where({ organization_id: organizationId })
    .select(ASSET_TYPE_COLUMNS)
    .orderBy([{ column: 'name', order: 'asc' }, { column: 'id', order: 'asc' }]);

  if (typeof active === 'boolean') query.andWhere({ active });

  const qText = typeof q === 'string' ? q.trim() : '';
  if (qText) {
    query.andWhere((b) => b.whereRaw('code ilike ?', [`%${qText}%`]).orWhereRaw('name ilike ?', [`%${qText}%`]));
  }

  const codeText = typeof code === 'string' ? code.trim() : '';
  if (codeText) query.andWhereRaw('lower(code) = lower(?)', [codeText]);

  const nameText = typeof name === 'string' ? name.trim() : '';
  if (nameText) query.andWhereRaw('name ilike ?', [`%${nameText}%`]);

  if (typeof hasSchema === 'boolean') {
    if (hasSchema) {
      query.whereExists(
        db('asset_type_fields as atf')
          .select(db.raw('1'))
          .whereRaw('atf.asset_type_id = asset_types.id')
          .andWhere('atf.organization_id', organizationId)
      );
    } else {
      query.whereNotExists(
        db('asset_type_fields as atf')
          .select(db.raw('1'))
          .whereRaw('atf.asset_type_id = asset_types.id')
          .andWhere('atf.organization_id', organizationId)
      );
    }
  }

  const rows = await query;
  const fields = await listAssetTypeFieldsByIds(db, organizationId, rows.map((row) => row.id));
  return attachFields(rows, fields);
}

export async function createAssetType(trx, { organizationId, code, name, active, fields }) {
  const rows = await trx('asset_types')
    .insert({
      organization_id: organizationId,
      code,
      name,
      active: active ?? true
    })
    .returning(ASSET_TYPE_COLUMNS);

  const assetType = rows[0];
  const fieldRows = await replaceAssetTypeFields(trx, { organizationId, assetTypeId: assetType.id, fields });
  return { ...assetType, fields: fieldRows };
}

export async function updateAssetType(trx, { organizationId, assetTypeId, code, name, active, fields }) {
  const rows = await trx('asset_types')
    .where({ id: assetTypeId, organization_id: organizationId })
    .update({
      code,
      name,
      active: active ?? true,
      updated_at: trx.fn.now()
    })
    .returning(ASSET_TYPE_COLUMNS);

  const assetType = rows[0] ?? null;
  if (!assetType) return null;

  const fieldRows = await replaceAssetTypeFields(trx, { organizationId, assetTypeId, fields });
  return { ...assetType, fields: fieldRows };
}

export async function deleteAssetType(trx, { organizationId, assetTypeId }) {
  const rows = await trx('asset_types').where({ id: assetTypeId, organization_id: organizationId }).del().returning(['id']);
  return rows[0] ?? null;
}

export async function listAssetTypeFieldsByAssetType(organizationId, assetTypeId, { active } = {}) {
  const query = db('asset_type_fields')
    .where({ organization_id: organizationId, asset_type_id: assetTypeId })
    .select(ASSET_TYPE_FIELD_COLUMNS)
    .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'id', order: 'asc' }]);

  if (typeof active === 'boolean') query.andWhere({ active });

  return query;
}
