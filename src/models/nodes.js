import db from '../db/knex.js';

export async function listNodesByOrganization(organizationId, { types } = {}) {
  const query = db('nodes')
    .where({ organization_id: organizationId })
    .select([
      'id',
      'organization_id',
      'node_type',
      'ref_table',
      'ref_id',
      'code',
      'name',
      'is_stocked',
      'meta_json'
    ])
    .orderBy([{ column: 'node_type', order: 'asc' }, { column: 'name', order: 'asc' }]);

  if (types && types.length > 0) query.whereIn('node_type', types);
  return query;
}

export async function getNodeById(id) {
  return db('nodes')
    .where({ id })
    .first(['id', 'organization_id', 'node_type', 'ref_table', 'ref_id', 'code', 'name', 'is_stocked', 'meta_json']);
}

export async function findNodeByRef(organizationId, nodeType, refTable, refId) {
  return db('nodes')
    .where({
      organization_id: organizationId,
      node_type: nodeType,
      ref_table: refTable,
      ref_id: String(refId)
    })
    .first(['id', 'organization_id', 'node_type', 'ref_table', 'ref_id', 'name']);
}

export async function upsertVirtualNode(trx, { organizationId, nodeType = 'VIRTUAL', key, name, code, isStocked = false, metaJson }) {
  const rows = await trx('nodes')
    .insert({
      organization_id: organizationId,
      node_type: nodeType,
      ref_table: 'virtual',
      ref_id: key,
      code: code ?? null,
      name,
      is_stocked: isStocked,
      meta_json: metaJson ?? null
    })
    .onConflict(['organization_id', 'node_type', 'ref_table', 'ref_id'])
    .merge({ name, code: code ?? null, is_stocked: isStocked, meta_json: metaJson ?? null, updated_at: trx.fn.now() })
    .returning(['id', 'organization_id', 'node_type', 'ref_table', 'ref_id', 'name']);

  return rows[0];
}

export async function upsertRefNode(
  trx,
  { organizationId, nodeType, refTable, refId, name, code, isStocked = true, metaJson }
) {
  const rows = await trx('nodes')
    .insert({
      organization_id: organizationId,
      node_type: nodeType,
      ref_table: refTable,
      ref_id: String(refId),
      code: code ?? null,
      name,
      is_stocked: isStocked,
      meta_json: metaJson ?? null
    })
    .onConflict(['organization_id', 'node_type', 'ref_table', 'ref_id'])
    .merge({ name, code: code ?? null, is_stocked: isStocked, meta_json: metaJson ?? null, updated_at: trx.fn.now() })
    .returning(['id', 'organization_id', 'node_type', 'ref_table', 'ref_id', 'name']);

  return rows[0];
}

export async function deleteRefNode(trx, { organizationId, nodeType, refTable, refId }) {
  const rows = await trx('nodes')
    .where({
      organization_id: organizationId,
      node_type: nodeType,
      ref_table: refTable,
      ref_id: String(refId)
    })
    .del()
    .returning(['id']);

  return rows[0] ?? null;
}
