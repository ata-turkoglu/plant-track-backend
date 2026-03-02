import db from '../db/knex.js';

export async function listCurrenciesByOrganization(organizationId) {
  return db('currencies')
    .where({ organization_id: organizationId })
    .orderBy([
      { column: 'system', order: 'desc' },
      { column: 'code', order: 'asc' }
    ])
    .select(['id', 'organization_id', 'code', 'name', 'symbol', 'system', 'created_at', 'updated_at']);
}

export async function getCurrencyById(id) {
  return db('currencies').where({ id }).first(['id', 'organization_id', 'code', 'name', 'symbol', 'system']);
}

export async function createCurrency(trx, { organizationId, code, name, symbol }) {
  const rows = await trx('currencies')
    .insert({
      organization_id: organizationId,
      code,
      name,
      symbol: symbol ?? null,
      system: false
    })
    .returning(['id', 'organization_id', 'code', 'name', 'symbol', 'system', 'created_at', 'updated_at']);

  return rows[0];
}

export async function updateCurrency(trx, { id, organizationId, code, name, symbol }) {
  const rows = await trx('currencies')
    .where({ id, organization_id: organizationId })
    .update({
      code,
      name,
      symbol: symbol ?? null,
      updated_at: trx.fn.now()
    })
    .returning(['id', 'organization_id', 'code', 'name', 'symbol', 'system', 'created_at', 'updated_at']);

  return rows[0] ?? null;
}

export async function deleteCurrency(trx, { id, organizationId }) {
  const rows = await trx('currencies')
    .where({ id, organization_id: organizationId })
    .del()
    .returning(['id']);

  return rows[0] ?? null;
}
