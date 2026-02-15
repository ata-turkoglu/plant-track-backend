import db from '../db/knex.js';

export async function listWarehouseTypesByOrganization(organizationId) {
  return db('warehouse_types')
    .where({ organization_id: organizationId })
    .orderBy([{ column: 'system', order: 'desc' }, { column: 'name', order: 'asc' }])
    .select(['id', 'organization_id', 'code', 'name', 'description', 'system']);
}

export async function getWarehouseTypeById(id) {
  return db('warehouse_types').where({ id }).first(['id', 'organization_id', 'code', 'name']);
}
