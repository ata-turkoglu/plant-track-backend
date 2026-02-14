import db from '../db/knex.js';

export async function listLocationsByOrganization(organizationId) {
  return db('locations')
    .where({ organization_id: organizationId })
    .orderBy([{ column: 'parent_id', order: 'asc' }, { column: 'id', order: 'asc' }])
    .select(['id', 'organization_id', 'parent_id', 'name']);
}

export async function createLocation(trx, { organizationId, parentId, name }) {
  const rows = await trx('locations')
    .insert({
      organization_id: organizationId,
      parent_id: parentId ?? null,
      name
    })
    .returning(['id', 'organization_id', 'parent_id', 'name']);

  return rows[0];
}

export async function updateLocation(trx, { id, organizationId, name }) {
  const rows = await trx('locations')
    .where({ id, organization_id: organizationId })
    .update({ name, updated_at: trx.fn.now() })
    .returning(['id', 'organization_id', 'parent_id', 'name']);

  return rows[0] ?? null;
}

export async function getLocationById(id) {
  return db('locations').where({ id }).first(['id', 'organization_id', 'parent_id', 'name']);
}

export async function hasChildren(id) {
  const row = await db('locations').where({ parent_id: id }).first(['id']);
  return Boolean(row);
}

export async function deleteLocation(trx, { id, organizationId }) {
  return trx('locations').where({ id, organization_id: organizationId }).del();
}
