import db from '../db/knex.js';
import { createAsset, deleteAsset, listAssetsByOrganization } from './assets.js';

const MACHINE_COLUMNS = ['id', 'organization_id', 'name', 'active', 'created_at', 'updated_at'];

// Backwards-compatible adapter: legacy "machines" API now uses "assets" table.
export async function listMachinesByOrganization(organizationId) {
  const rows = await listAssetsByOrganization(organizationId, {});
  return rows.map((row) => ({
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

// Legacy signature did not scope by organization. Keep behavior for compatibility.
export async function getMachineById(id) {
  return db('assets').where({ id }).first(MACHINE_COLUMNS);
}

export async function createMachine(trx, { organizationId, name, active }) {
  const created = await createAsset(trx, {
    organizationId,
    locationId: null,
    parentAssetId: null,
    assetTypeId: null,
    code: null,
    name,
    active,
    attributesJson: null
  });

  return {
    id: created.id,
    organization_id: created.organization_id,
    name: created.name,
    active: created.active,
    created_at: created.created_at,
    updated_at: created.updated_at
  };
}

export async function updateMachine(trx, { organizationId, machineId, name, active }) {
  const rows = await trx('assets')
    .where({ id: machineId, organization_id: organizationId })
    .update({
      name,
      active: active ?? true,
      updated_at: trx.fn.now()
    })
    .returning(MACHINE_COLUMNS);

  return rows[0] ?? null;
}

export async function deleteMachine(trx, { organizationId, machineId }) {
  return deleteAsset(trx, { organizationId, assetId: machineId });
}
