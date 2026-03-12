import db from '../db/knex.js';

export const DEFAULT_LOCATION_TYPES = [
  { code: 'business_group', name: 'Business Group', description: 'Business grouping node' },
  { code: 'factory', name: 'Factory', description: 'Factory / plant location' },
  { code: 'other', name: 'Other', description: 'Other location type' }
];

export async function ensureDefaultLocationTypesForOrganization(trx, organizationId) {
  if (!Number.isFinite(Number(organizationId))) return;

  await trx('location_types')
    .insert(
      DEFAULT_LOCATION_TYPES.map((type) => ({
        organization_id: organizationId,
        code: type.code,
        name: type.name,
        description: type.description,
        system: true
      }))
    )
    .onConflict(['organization_id', 'code'])
    .ignore();
}

export async function listLocationTypesByOrganization(organizationId) {
  return db('location_types')
    .where({ organization_id: organizationId })
    .orderBy([{ column: 'system', order: 'desc' }, { column: 'name', order: 'asc' }])
    .select(['id', 'organization_id', 'code', 'name', 'description', 'system']);
}

export async function createLocationType(trx, { organizationId, code, name, description }) {
  const rows = await trx('location_types')
    .insert({
      organization_id: organizationId,
      code,
      name,
      description: description ?? null,
      system: false
    })
    .returning(['id', 'organization_id', 'code', 'name', 'description', 'system']);

  return rows[0];
}

export async function getLocationTypeById(id) {
  return db('location_types').where({ id }).first(['id', 'organization_id', 'code', 'name', 'description', 'system']);
}

export async function getLocationTypeByCode(organizationId, code) {
  return db('location_types')
    .whereRaw('lower(code) = ?', [String(code ?? '').trim().toLowerCase()])
    .where({ organization_id: organizationId })
    .first(['id', 'organization_id', 'code', 'name', 'description', 'system']);
}
