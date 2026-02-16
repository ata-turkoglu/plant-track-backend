import db from '../db/knex.js';

export async function listSuppliersByOrganization(organizationId, { kind } = {}) {
  const q = db('suppliers')
    .where({ organization_id: organizationId })
    .orderBy([{ column: 'kind', order: 'asc' }, { column: 'name', order: 'asc' }])
    .select(['id', 'organization_id', 'kind', 'name', 'active', 'created_at', 'updated_at']);
  if (kind) q.andWhere({ kind });
  return q;
}

export async function getSupplierById(id) {
  return db('suppliers').where({ id }).first(['id', 'organization_id', 'kind', 'name', 'active', 'created_at', 'updated_at']);
}

export async function createSupplier(trx, { organizationId, kind, name, active }) {
  const rows = await trx('suppliers')
    .insert({
      organization_id: organizationId,
      kind,
      name,
      active: active ?? true
    })
    .returning(['id', 'organization_id', 'kind', 'name', 'active', 'created_at', 'updated_at']);

  return rows[0];
}

export async function updateSupplier(trx, { organizationId, supplierId, kind, name, active }) {
  const rows = await trx('suppliers')
    .where({ id: supplierId, organization_id: organizationId })
    .update({
      kind,
      name,
      active: active ?? true,
      updated_at: trx.fn.now()
    })
    .returning(['id', 'organization_id', 'kind', 'name', 'active', 'created_at', 'updated_at']);

  return rows[0] ?? null;
}

export async function deleteSupplier(trx, { organizationId, supplierId }) {
  const rows = await trx('suppliers').where({ id: supplierId, organization_id: organizationId }).del().returning(['id']);
  return rows[0] ?? null;
}

