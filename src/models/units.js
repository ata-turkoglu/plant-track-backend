import db from '../db/knex.js';

export async function listUnitsByOrganization(organizationId) {
  return db('units')
    .where({ organization_id: organizationId, active: true })
    .orderBy([{ column: 'system', order: 'desc' }, { column: 'name', order: 'asc' }])
    .select(['id', 'organization_id', 'code', 'name', 'symbol', 'system', 'active']);
}

export async function getUnitById(id) {
  return db('units').where({ id }).first(['id', 'organization_id', 'code', 'name', 'symbol', 'active']);
}
