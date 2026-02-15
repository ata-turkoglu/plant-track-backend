import db from '../db/knex.js';

export async function listWarehousesByOrganization(organizationId) {
  return db('warehouses')
    .from({ w: 'warehouses' })
    .leftJoin({ wt: 'warehouse_types' }, 'wt.id', 'w.warehouse_type_id')
    .where({ 'w.organization_id': organizationId })
    .orderBy([{ column: 'w.id', order: 'asc' }])
    .select([
      'w.id',
      'w.organization_id',
      'w.location_id',
      'w.name',
      'w.warehouse_type_id',
      db.raw('wt.code as warehouse_type_code'),
      db.raw('wt.name as warehouse_type_name')
    ]);
}

export async function createWarehouse(trx, { organizationId, locationId, name, warehouseTypeId }) {
  const rows = await trx('warehouses')
    .insert({
      organization_id: organizationId,
      location_id: locationId,
      name,
      warehouse_type_id: warehouseTypeId
    })
    .returning(['id', 'organization_id', 'location_id', 'name', 'warehouse_type_id']);

  return rows[0];
}

export async function updateWarehouse(trx, { id, organizationId, locationId, name, warehouseTypeId }) {
  const rows = await trx('warehouses')
    .where({ id, organization_id: organizationId })
    .update({ location_id: locationId, name, warehouse_type_id: warehouseTypeId, updated_at: trx.fn.now() })
    .returning(['id', 'organization_id', 'location_id', 'name', 'warehouse_type_id']);

  return rows[0] ?? null;
}

export async function getWarehouseById(id) {
  return db('warehouses')
    .where({ id })
    .first(['id', 'organization_id', 'location_id', 'name', 'warehouse_type_id']);
}

export async function deleteWarehouse(trx, { id, organizationId }) {
  return trx('warehouses').where({ id, organization_id: organizationId }).del();
}
