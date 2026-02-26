import db from '../db/knex.js';

const ITEM_GROUP_COLUMNS = [
  'id',
  'organization_id',
  'warehouse_type_id',
  'amount_unit_id',
  'code',
  'name',
  'size_spec',
  'size_unit_id',
  'active',
  'created_at',
  'updated_at'
];

export async function listItemGroupsByOrganization(organizationId, { active, q, warehouseTypeId, warehouseTypeCode } = {}) {
  const query = db('item_groups')
    .where({ organization_id: organizationId })
    .select(ITEM_GROUP_COLUMNS)
    .orderBy([
      { column: 'active', order: 'desc' },
      { column: 'name', order: 'asc' },
      { column: 'id', order: 'asc' }
    ]);

  if (typeof active === 'boolean') query.andWhere({ active });

  const qText = typeof q === 'string' ? q.trim() : '';
  if (qText) {
    query.andWhere((b) =>
      b
        .whereRaw('code ilike ?', [`%${qText}%`])
        .orWhereRaw('name ilike ?', [`%${qText}%`])
        .orWhereRaw('size_spec ilike ?', [`%${qText}%`])
    );
  }

  const parsedWarehouseTypeId = Number(warehouseTypeId);
  if (Number.isFinite(parsedWarehouseTypeId) && parsedWarehouseTypeId > 0) {
    query.andWhere({ warehouse_type_id: parsedWarehouseTypeId });
  }

  const warehouseTypeCodeText = typeof warehouseTypeCode === 'string' ? warehouseTypeCode.trim() : '';
  if (warehouseTypeCodeText) {
    query.whereIn(
      'warehouse_type_id',
      db('warehouse_types')
        .where({ organization_id: organizationId })
        .whereRaw('lower(code) = lower(?)', [warehouseTypeCodeText])
        .select(['id'])
    );
  }

  return query;
}

export async function getItemGroupById(id) {
  return db('item_groups').where({ id }).first(ITEM_GROUP_COLUMNS);
}

export async function createItemGroup(
  trx,
  { organizationId, warehouseTypeId, amountUnitId, code, name, sizeSpec, sizeUnitId, active }
) {
  const rows = await trx('item_groups')
    .insert({
      organization_id: organizationId,
      warehouse_type_id: warehouseTypeId,
      amount_unit_id: amountUnitId,
      code,
      name,
      size_spec: sizeSpec ?? null,
      size_unit_id: sizeUnitId ?? null,
      active: active ?? true
    })
    .returning(['id']);

  const insertedId = rows[0]?.id ?? null;
  if (!insertedId) return null;

  return trx('item_groups')
    .where({ id: insertedId, organization_id: organizationId })
    .first(ITEM_GROUP_COLUMNS);
}

export async function updateItemGroup(
  trx,
  { organizationId, itemGroupId, warehouseTypeId, amountUnitId, code, name, sizeSpec, sizeUnitId, active }
) {
  const rows = await trx('item_groups')
    .where({ id: itemGroupId, organization_id: organizationId })
    .update({
      warehouse_type_id: warehouseTypeId,
      amount_unit_id: amountUnitId,
      code,
      name,
      size_spec: sizeSpec ?? null,
      size_unit_id: sizeUnitId ?? null,
      active: active ?? true,
      updated_at: trx.fn.now()
    })
    .returning(['id']);

  const updatedId = rows[0]?.id ?? null;
  if (!updatedId) return null;

  return trx('item_groups')
    .where({ id: updatedId, organization_id: organizationId })
    .first(ITEM_GROUP_COLUMNS);
}

export async function setItemGroupActive(trx, { organizationId, itemGroupId, active }) {
  const rows = await trx('item_groups')
    .where({ id: itemGroupId, organization_id: organizationId })
    .update({ active, updated_at: trx.fn.now() })
    .returning(['id']);

  const updatedId = rows[0]?.id ?? null;
  if (!updatedId) return null;

  return trx('item_groups')
    .where({ id: updatedId, organization_id: organizationId })
    .first(ITEM_GROUP_COLUMNS);
}

export async function deleteItemGroup(trx, { organizationId, itemGroupId }) {
  return trx('item_groups').where({ id: itemGroupId, organization_id: organizationId }).del();
}
