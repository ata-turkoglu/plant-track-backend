import db from '../db/knex.js';

export async function listUnitsByOrganization(organizationId) {
  return db({ u: 'units' })
    .leftJoin({ tu: 'translations' }, function joinUnitTranslations() {
      this.on('tu.organization_id', '=', 'u.organization_id')
        .andOn(db.raw("tu.namespace = 'unit'"))
        .andOn(db.raw('tu.entry_key = lower(u.code)'));
    })
    .leftJoin({ ts: 'translations' }, function joinUnitSymbolTranslations() {
      this.on('ts.organization_id', '=', 'u.organization_id')
        .andOn(db.raw("ts.namespace = 'unit_symbol'"))
        .andOn(db.raw('ts.entry_key = lower(u.symbol)'));
    })
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
      db.raw('tu.tr as tr_name'),
      db.raw('tu.en as en_name'),
      db.raw('ts.tr as tr_symbol'),
      db.raw('ts.en as en_symbol')
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
