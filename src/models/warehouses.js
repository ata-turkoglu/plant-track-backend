import db from '../db/knex.js';

export async function listWarehousesByOrganization(organizationId) {
  return db('warehouses')
    .where({ organization_id: organizationId })
    .orderBy([{ column: 'id', order: 'asc' }])
    .select(['id', 'organization_id', 'location_id', 'name', 'type']);
}

export async function createWarehouse(trx, { organizationId, locationId, name, type }) {
  const rows = await trx('warehouses')
    .insert({
      organization_id: organizationId,
      location_id: locationId,
      name,
      type
    })
    .returning(['id', 'organization_id', 'location_id', 'name', 'type']);

  return rows[0];
}

export async function updateWarehouse(trx, { id, organizationId, locationId, name, type }) {
  const rows = await trx('warehouses')
    .where({ id, organization_id: organizationId })
    .update({ location_id: locationId, name, type, updated_at: trx.fn.now() })
    .returning(['id', 'organization_id', 'location_id', 'name', 'type']);

  return rows[0] ?? null;
}

export async function getWarehouseById(id) {
  return db('warehouses').where({ id }).first(['id', 'organization_id', 'location_id', 'name', 'type']);
}

export async function deleteWarehouse(trx, { id, organizationId }) {
  return trx('warehouses').where({ id, organization_id: organizationId }).del();
}
