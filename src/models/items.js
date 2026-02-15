import db from '../db/knex.js';

export async function listItemsByOrganization(organizationId) {
  return db('items')
    .where({ organization_id: organizationId })
    .orderBy([{ column: 'active', order: 'desc' }, { column: 'name', order: 'asc' }])
    .select(['id', 'organization_id', 'warehouse_type_id', 'type', 'code', 'name', 'uom', 'unit_id', 'active']);
}

export async function getItemById(id) {
  return db('items')
    .where({ id })
    .first(['id', 'organization_id', 'warehouse_type_id', 'type', 'code', 'name', 'uom', 'unit_id', 'active']);
}

export async function createItem(trx, { organizationId, warehouseTypeId, type, code, name, uom, unitId, active }) {
  const rows = await trx('items')
    .insert({
      organization_id: organizationId,
      warehouse_type_id: warehouseTypeId,
      type,
      code,
      name,
      uom,
      unit_id: unitId,
      active: active ?? true
    })
    .returning(['id', 'organization_id', 'warehouse_type_id', 'type', 'code', 'name', 'uom', 'unit_id', 'active']);

  return rows[0];
}

export async function updateItem(trx, { organizationId, itemId, code, name, uom, unitId, active }) {
  const rows = await trx('items')
    .where({ id: itemId, organization_id: organizationId })
    .update({
      code,
      name,
      uom,
      unit_id: unitId,
      active,
      updated_at: trx.fn.now()
    })
    .returning(['id', 'organization_id', 'warehouse_type_id', 'type', 'code', 'name', 'uom', 'unit_id', 'active']);

  return rows[0] ?? null;
}

export async function setItemActive(trx, { organizationId, itemId, active }) {
  const rows = await trx('items')
    .where({ id: itemId, organization_id: organizationId })
    .update({ active, updated_at: trx.fn.now() })
    .returning(['id']);

  return rows[0] ?? null;
}
