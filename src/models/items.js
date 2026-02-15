import db from '../db/knex.js';

export async function listItemsByOrganization(organizationId) {
  return db('items')
    .where({ organization_id: organizationId })
    .orderBy([{ column: 'active', order: 'desc' }, { column: 'name', order: 'asc' }])
    .select(['id', 'organization_id', 'type', 'code', 'name', 'uom', 'unit_id', 'active']);
}

export async function getItemById(id) {
  return db('items').where({ id }).first(['id', 'organization_id', 'type', 'code', 'name', 'uom', 'unit_id', 'active']);
}

export async function createItem(trx, { organizationId, type, code, name, uom, unitId, active }) {
  const rows = await trx('items')
    .insert({
      organization_id: organizationId,
      type,
      code,
      name,
      uom,
      unit_id: unitId,
      active: active ?? true
    })
    .returning(['id', 'organization_id', 'type', 'code', 'name', 'uom', 'unit_id', 'active']);

  return rows[0];
}
