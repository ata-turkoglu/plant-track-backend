import db from '../db/knex.js';

const ASSET_CARD_COLUMNS = ['id', 'organization_id', 'code', 'name', 'description', 'active', 'created_at', 'updated_at'];
const ASSET_CARD_FIELD_COLUMNS = [
  'id',
  'organization_id',
  'asset_card_id',
  'name',
  'label',
  'is_default',
  'data_type',
  'required',
  'unit_id',
  'sort_order',
  'active',
  'created_at',
  'updated_at'
];

function attachFields(assetCards, fieldRows) {
  const grouped = new Map();

  for (const field of fieldRows) {
    const list = grouped.get(field.asset_card_id) ?? [];
    list.push(field);
    grouped.set(field.asset_card_id, list);
  }

  return assetCards.map((row) => ({
    ...row,
    fields: grouped.get(row.id) ?? []
  }));
}

async function listAssetCardFieldsByIds(dbOrTrx, organizationId, assetCardIds) {
  if (assetCardIds.length === 0) return [];

  return dbOrTrx('asset_card_fields')
    .where({ organization_id: organizationId })
    .whereIn('asset_card_id', assetCardIds)
    .select(ASSET_CARD_FIELD_COLUMNS)
    .orderBy([
      { column: 'asset_card_id', order: 'asc' },
      { column: 'sort_order', order: 'asc' },
      { column: 'id', order: 'asc' }
    ]);
}

async function replaceAssetCardFields(trx, { organizationId, assetCardId, fields }) {
  await trx('asset_card_fields').where({ organization_id: organizationId, asset_card_id: assetCardId }).del();

  if (!Array.isArray(fields) || fields.length === 0) return [];

  const rows = await trx('asset_card_fields')
    .insert(
      fields.map((field, index) => ({
        organization_id: organizationId,
        asset_card_id: assetCardId,
        name: field.name,
        label: field.label,
        is_default: Boolean(field.isDefault),
        data_type: field.dataType,
        required: field.required,
        unit_id: field.unitId,
        sort_order: Number.isFinite(field.sortOrder) ? field.sortOrder : index,
        active: field.active ?? true
      }))
    )
    .returning(ASSET_CARD_FIELD_COLUMNS);

  return rows.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
}

export async function listAssetCardsByOrganization(organizationId, { active, q, code, name, hasSchema } = {}) {
  const query = db('asset_cards')
    .where({ organization_id: organizationId })
    .select(ASSET_CARD_COLUMNS)
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
        db('asset_card_fields as acf')
          .select(db.raw('1'))
          .whereRaw('acf.asset_card_id = asset_cards.id')
          .andWhere('acf.organization_id', organizationId)
      );
    } else {
      query.whereNotExists(
        db('asset_card_fields as acf')
          .select(db.raw('1'))
          .whereRaw('acf.asset_card_id = asset_cards.id')
          .andWhere('acf.organization_id', organizationId)
      );
    }
  }

  const rows = await query;
  const fields = await listAssetCardFieldsByIds(db, organizationId, rows.map((row) => row.id));
  return attachFields(rows, fields);
}

export async function createAssetCard(trx, { organizationId, code, name, description, active, fields }) {
  const rows = await trx('asset_cards')
    .insert({
      organization_id: organizationId,
      code,
      name,
      description: description ?? null,
      active: active ?? true
    })
    .returning(ASSET_CARD_COLUMNS);

  const assetCard = rows[0];
  const fieldRows = await replaceAssetCardFields(trx, { organizationId, assetCardId: assetCard.id, fields });
  return { ...assetCard, fields: fieldRows };
}

export async function updateAssetCard(trx, { organizationId, assetCardId, code, name, description, active, fields }) {
  const rows = await trx('asset_cards')
    .where({ id: assetCardId, organization_id: organizationId })
    .update({
      code,
      name,
      description: description ?? null,
      active: active ?? true,
      updated_at: trx.fn.now()
    })
    .returning(ASSET_CARD_COLUMNS);

  const assetCard = rows[0] ?? null;
  if (!assetCard) return null;

  const fieldRows = await replaceAssetCardFields(trx, { organizationId, assetCardId, fields });
  return { ...assetCard, fields: fieldRows };
}

export async function deleteAssetCard(trx, { organizationId, assetCardId }) {
  const rows = await trx('asset_cards').where({ id: assetCardId, organization_id: organizationId }).del().returning(['id']);
  return rows[0] ?? null;
}

export async function listAssetCardFieldsByAssetCard(organizationId, assetCardId, { active } = {}) {
  const query = db('asset_card_fields')
    .where({ organization_id: organizationId, asset_card_id: assetCardId })
    .select(ASSET_CARD_FIELD_COLUMNS)
    .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'id', order: 'asc' }]);

  if (typeof active === 'boolean') query.andWhere({ active });

  return query;
}
