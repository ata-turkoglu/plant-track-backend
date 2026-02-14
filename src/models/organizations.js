import db from '../db/knex.js';

export async function createOrganization(trx, { name, code }) {
  const rows = await trx('organizations')
    .insert({ name, code: code ?? null })
    .returning(['id', 'name', 'code']);

  return rows[0];
}

export async function getOrganizationById(id) {
  return db('organizations').where({ id }).first(['id', 'name', 'code']);
}
