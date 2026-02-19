import db from '../db/knex.js';

export async function listUnitsByOrganization(organizationId) {
  return db({ u: 'units' })
    .where({ 'u.organization_id': organizationId })
    .orderBy([
      { column: 'u.system', order: 'desc' },
      { column: 'u.active', order: 'desc' },
      { column: 'u.name', order: 'asc' }
    ])
    .select([
      'u.id',
      'u.organization_id',
      'u.code',
      'u.name',
      'u.symbol',
      'u.system',
      'u.active',
      'u.created_at',
      'u.updated_at',
      db.raw(
        `(select t.tr from translations t where t.organization_id = u.organization_id and t.namespace = 'unit' and t.entry_key = lower(u.code) limit 1) as tr_name`
      ),
      db.raw(
        `(select t.en from translations t where t.organization_id = u.organization_id and t.namespace = 'unit' and t.entry_key = lower(u.code) limit 1) as en_name`
      ),
      db.raw(
        `(select t.tr from translations t where t.organization_id = u.organization_id and t.namespace = 'unit_symbol' and t.entry_key = lower(u.symbol) limit 1) as tr_symbol`
      ),
      db.raw(
        `(select t.en from translations t where t.organization_id = u.organization_id and t.namespace = 'unit_symbol' and t.entry_key = lower(u.symbol) limit 1) as en_symbol`
      )
    ]);
}

export async function getUnitById(id) {
  return db('units').where({ id }).first(['id', 'organization_id', 'code', 'name', 'symbol', 'system', 'active']);
}

export async function createUnit(trx, { organizationId, code, name, symbol }) {
  const rows = await trx('units')
    .insert({
      organization_id: organizationId,
      code,
      name,
      symbol: symbol ?? null,
      system: false,
      active: true
    })
    .returning(['id', 'organization_id', 'code', 'name', 'symbol', 'system', 'active', 'created_at', 'updated_at']);

  return rows[0];
}

export async function updateUnit(trx, { id, organizationId, code, name, symbol, active }) {
  const rows = await trx('units')
    .where({ id, organization_id: organizationId })
    .update({
      code,
      name,
      symbol: symbol ?? null,
      active,
      updated_at: trx.fn.now()
    })
    .returning(['id', 'organization_id', 'code', 'name', 'symbol', 'system', 'active', 'created_at', 'updated_at']);

  return rows[0] ?? null;
}

export async function deactivateUnit(trx, { id, organizationId }) {
  const rows = await trx('units')
    .where({ id, organization_id: organizationId })
    .update({
      active: false,
      updated_at: trx.fn.now()
    })
    .returning(['id', 'organization_id', 'code', 'name', 'symbol', 'system', 'active', 'created_at', 'updated_at']);

  return rows[0] ?? null;
}
