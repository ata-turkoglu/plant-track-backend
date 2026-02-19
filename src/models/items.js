import db from '../db/knex.js';

export async function listItemsByOrganization(organizationId) {
  return db('items')
    .where({ organization_id: organizationId })
    .orderBy([{ column: 'active', order: 'desc' }, { column: 'name', order: 'asc' }])
    .select([
      'id',
      'organization_id',
      'warehouse_type_id',
      'code',
      'name',
      'brand',
      'model',
      'size_spec',
      'size_unit_id',
      'unit_id',
      'active'
    ]);
}

export async function getItemById(id) {
  return db('items')
    .where({ id })
    .first([
      'id',
      'organization_id',
      'warehouse_type_id',
      'code',
      'name',
      'brand',
      'model',
      'size_spec',
      'size_unit_id',
      'unit_id',
      'active'
    ]);
}

export async function createItem(
  trx,
  { organizationId, warehouseTypeId, code, name, brand, model, sizeSpec, sizeUnitId, unitId, active }
) {
  const rows = await trx('items')
    .insert({
      organization_id: organizationId,
      warehouse_type_id: warehouseTypeId,
      code,
      name,
      brand: brand ?? null,
      model: model ?? null,
      size_spec: sizeSpec ?? null,
      size_unit_id: sizeUnitId ?? null,
      unit_id: unitId,
      active: active ?? true
    })
    .returning([
      'id',
      'organization_id',
      'warehouse_type_id',
      'code',
      'name',
      'brand',
      'model',
      'size_spec',
      'size_unit_id',
      'unit_id',
      'active'
    ]);

  return rows[0];
}

export async function updateItem(
  trx,
  { organizationId, itemId, code, name, brand, model, sizeSpec, sizeUnitId, unitId, active }
) {
  const rows = await trx('items')
    .where({ id: itemId, organization_id: organizationId })
    .update({
      code,
      name,
      brand: brand ?? null,
      model: model ?? null,
      size_spec: sizeSpec ?? null,
      size_unit_id: sizeUnitId ?? null,
      unit_id: unitId,
      active,
      updated_at: trx.fn.now()
    })
    .returning([
      'id',
      'organization_id',
      'warehouse_type_id',
      'code',
      'name',
      'brand',
      'model',
      'size_spec',
      'size_unit_id',
      'unit_id',
      'active'
    ]);

  return rows[0] ?? null;
}

export async function setItemActive(trx, { organizationId, itemId, active }) {
  const rows = await trx('items')
    .where({ id: itemId, organization_id: organizationId })
    .update({ active, updated_at: trx.fn.now() })
    .returning(['id']);

  return rows[0] ?? null;
}
