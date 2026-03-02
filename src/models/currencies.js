import db from '../db/knex.js';

export async function listCurrenciesByOrganization(organizationId) {
  return db('currencies')
    .where({ organization_id: organizationId })
    .orderBy([
      { column: 'system', order: 'desc' },
      { column: 'active', order: 'desc' },
      { column: 'code', order: 'asc' }
    ])
    .select(['id', 'organization_id', 'code', 'name', 'symbol', 'system', 'active', 'created_at', 'updated_at']);
}

export async function getCurrencyById(id) {
  return db('currencies').where({ id }).first(['id', 'organization_id', 'code', 'name', 'symbol', 'system', 'active']);
}

export async function createCurrency(trx, { organizationId, code, name, symbol }) {
  const rows = await trx('currencies')
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

export async function updateCurrency(trx, { id, organizationId, code, name, symbol, active }) {
  const rows = await trx('currencies')
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

export async function deactivateCurrency(trx, { id, organizationId }) {
  const rows = await trx('currencies')
    .where({ id, organization_id: organizationId })
    .update({
      active: false,
      updated_at: trx.fn.now()
    })
    .returning(['id', 'organization_id', 'code', 'name', 'symbol', 'system', 'active', 'created_at', 'updated_at']);

  return rows[0] ?? null;
}

