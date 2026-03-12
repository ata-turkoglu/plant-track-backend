import db from '../db/knex.js';

export async function listLocationsByOrganization(organizationId) {
  return db('locations')
    .from({ l: 'locations' })
    .leftJoin({ lt: 'location_types' }, 'lt.id', 'l.location_type_id')
    .where({ 'l.organization_id': organizationId })
    .orderBy([{ column: 'l.parent_id', order: 'asc' }, { column: 'l.id', order: 'asc' }])
    .select([
      'l.id',
      'l.organization_id',
      'l.parent_id',
      'l.name',
      'l.location_type_id',
      db.raw('lt.code as location_type_code'),
      db.raw('lt.name as location_type_name')
    ]);
}

export async function createLocation(trx, { organizationId, parentId, name, locationTypeId }) {
  const rows = await trx('locations')
    .insert({
      organization_id: organizationId,
      parent_id: parentId ?? null,
      name,
      location_type_id: locationTypeId
    })
    .returning(['id', 'organization_id', 'parent_id', 'name', 'location_type_id']);

  return rows[0];
}

export async function updateLocation(trx, { id, organizationId, name, locationTypeId }) {
  const rows = await trx('locations')
    .where({ id, organization_id: organizationId })
    .update({ name, location_type_id: locationTypeId, updated_at: trx.fn.now() })
    .returning(['id', 'organization_id', 'parent_id', 'name', 'location_type_id']);

  return rows[0] ?? null;
}

export async function getLocationById(id) {
  return db('locations').where({ id }).first(['id', 'organization_id', 'parent_id', 'name', 'location_type_id']);
}

export async function hasChildren(id) {
  const row = await db('locations').where({ parent_id: id }).first(['id']);
  return Boolean(row);
}

export async function deleteLocation(trx, { id, organizationId }) {
  return trx('locations').where({ id, organization_id: organizationId }).del();
}
