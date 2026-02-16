import db from '../db/knex.js';

export async function listCustomersByOrganization(organizationId) {
  return db('customers')
    .where({ organization_id: organizationId })
    .orderBy([{ column: 'name', order: 'asc' }])
    .select(['id', 'organization_id', 'name', 'active', 'created_at', 'updated_at']);
}

export async function getCustomerById(id) {
  return db('customers').where({ id }).first(['id', 'organization_id', 'name', 'active', 'created_at', 'updated_at']);
}

export async function createCustomer(trx, { organizationId, name, active }) {
  const rows = await trx('customers')
    .insert({
      organization_id: organizationId,
      name,
      active: active ?? true
    })
    .returning(['id', 'organization_id', 'name', 'active', 'created_at', 'updated_at']);

  return rows[0];
}

export async function updateCustomer(trx, { organizationId, customerId, name, active }) {
  const rows = await trx('customers')
    .where({ id: customerId, organization_id: organizationId })
    .update({
      name,
      active: active ?? true,
      updated_at: trx.fn.now()
    })
    .returning(['id', 'organization_id', 'name', 'active', 'created_at', 'updated_at']);

  return rows[0] ?? null;
}

export async function deleteCustomer(trx, { organizationId, customerId }) {
  const rows = await trx('customers').where({ id: customerId, organization_id: organizationId }).del().returning(['id']);
  return rows[0] ?? null;
}

