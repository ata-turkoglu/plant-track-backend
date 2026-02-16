import db from '../db/knex.js';

export async function listMachinesByOrganization(organizationId) {
  return db('machines')
    .where({ organization_id: organizationId })
    .orderBy([{ column: 'name', order: 'asc' }])
    .select(['id', 'organization_id', 'name', 'active', 'created_at', 'updated_at']);
}

export async function getMachineById(id) {
  return db('machines').where({ id }).first(['id', 'organization_id', 'name', 'active', 'created_at', 'updated_at']);
}

export async function createMachine(trx, { organizationId, name, active }) {
  const rows = await trx('machines')
    .insert({
      organization_id: organizationId,
      name,
      active: active ?? true
    })
    .returning(['id', 'organization_id', 'name', 'active', 'created_at', 'updated_at']);

  return rows[0];
}

export async function updateMachine(trx, { organizationId, machineId, name, active }) {
  const rows = await trx('machines')
    .where({ id: machineId, organization_id: organizationId })
    .update({
      name,
      active: active ?? true,
      updated_at: trx.fn.now()
    })
    .returning(['id', 'organization_id', 'name', 'active', 'created_at', 'updated_at']);

  return rows[0] ?? null;
}

export async function deleteMachine(trx, { organizationId, machineId }) {
  const rows = await trx('machines').where({ id: machineId, organization_id: organizationId }).del().returning(['id']);
  return rows[0] ?? null;
}

