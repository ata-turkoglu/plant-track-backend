import db from '../db/knex.js';

export async function listAssetsByOrganization(
  organizationId,
  { locationId, parentAssetId, assetTypeId, active } = {}
) {
  const q = db('assets')
    .where({ organization_id: organizationId })
    .select([
      'id',
      'organization_id',
      'location_id',
      'parent_asset_id',
      'asset_type_id',
      'code',
      'name',
      'image_url',
      'active',
      'current_state',
      'running_since',
      'runtime_seconds',
      'attributes_json',
      'created_at',
      'updated_at'
    ])
    .orderBy([{ column: 'name', order: 'asc' }, { column: 'id', order: 'asc' }]);

  if (typeof active === 'boolean') q.andWhere({ active });
  if (Number.isFinite(Number(locationId))) q.andWhere({ location_id: Number(locationId) });
  if (Number.isFinite(Number(assetTypeId))) q.andWhere({ asset_type_id: Number(assetTypeId) });

  if (parentAssetId === null) q.whereNull('parent_asset_id');
  if (Number.isFinite(Number(parentAssetId))) q.andWhere({ parent_asset_id: Number(parentAssetId) });

  return q;
}

export async function getAssetById(organizationId, assetId) {
  return db('assets')
    .where({ id: assetId, organization_id: organizationId })
    .first([
      'id',
      'organization_id',
      'location_id',
      'parent_asset_id',
      'asset_type_id',
      'code',
      'name',
      'image_url',
      'active',
      'current_state',
      'running_since',
      'runtime_seconds',
      'attributes_json',
      'created_at',
      'updated_at'
    ]);
}

export async function createAsset(
  trx,
  { organizationId, locationId, parentAssetId, assetTypeId, code, name, imageUrl, active, attributesJson }
) {
  const rows = await trx('assets')
    .insert({
      organization_id: organizationId,
      location_id: locationId,
      parent_asset_id: parentAssetId ?? null,
      asset_type_id: assetTypeId ?? null,
      code: code ?? null,
      name,
      image_url: imageUrl ?? null,
      active: active ?? true,
      attributes_json: attributesJson ?? null,
      current_state: 'STOPPED',
      running_since: null,
      runtime_seconds: 0
    })
    .returning([
      'id',
      'organization_id',
      'location_id',
      'parent_asset_id',
      'asset_type_id',
      'code',
      'name',
      'image_url',
      'active',
      'current_state',
      'running_since',
      'runtime_seconds',
      'attributes_json',
      'created_at',
      'updated_at'
    ]);

  return rows[0];
}

export async function updateAsset(trx, { organizationId, assetId, parentAssetId, assetTypeId, code, name, imageUrl, active, attributesJson }) {
  const rows = await trx('assets')
    .where({ id: assetId, organization_id: organizationId })
    .update({
      parent_asset_id: parentAssetId ?? null,
      asset_type_id: assetTypeId ?? null,
      code: code ?? null,
      name,
      image_url: imageUrl ?? null,
      active: active ?? true,
      attributes_json: attributesJson ?? null,
      updated_at: trx.fn.now()
    })
    .returning([
      'id',
      'organization_id',
      'location_id',
      'parent_asset_id',
      'asset_type_id',
      'code',
      'name',
      'image_url',
      'active',
      'current_state',
      'running_since',
      'runtime_seconds',
      'attributes_json',
      'created_at',
      'updated_at'
    ]);

  return rows[0] ?? null;
}

export async function deleteAsset(trx, { organizationId, assetId }) {
  const rows = await trx('assets').where({ id: assetId, organization_id: organizationId }).del().returning(['id']);
  return rows[0] ?? null;
}

export async function lockAssetForUpdate(trx, { organizationId, assetId }) {
  return trx('assets')
    .where({ id: assetId, organization_id: organizationId })
    .forUpdate()
    .first(['id', 'location_id', 'current_state', 'running_since', 'runtime_seconds', 'active', 'code', 'name', 'asset_type_id', 'parent_asset_id']);
}

export async function updateAssetLocation(trx, { organizationId, assetId, toLocationId }) {
  const rows = await trx('assets')
    .where({ id: assetId, organization_id: organizationId })
    .update({ location_id: toLocationId, updated_at: trx.fn.now() })
    .returning([
      'id',
      'organization_id',
      'location_id',
      'parent_asset_id',
      'asset_type_id',
      'code',
      'name',
      'image_url',
      'active',
      'current_state',
      'running_since',
      'runtime_seconds',
      'attributes_json',
      'created_at',
      'updated_at'
    ]);
  return rows[0] ?? null;
}

export async function updateAssetState(trx, { organizationId, assetId, currentState, runningSince, runtimeSeconds, toState, occurredAt }) {
  // NOTE: This function expects the caller to lock/read the current row to compute correct transitions.
  const updates = { current_state: toState, updated_at: trx.fn.now() };

  if (toState === 'RUNNING') {
    updates.running_since = occurredAt;
  } else {
    updates.running_since = null;
    if (currentState === 'RUNNING' && runningSince) {
      const deltaSeconds = Math.floor((new Date(occurredAt).getTime() - new Date(runningSince).getTime()) / 1000);
      updates.runtime_seconds = Number(runtimeSeconds ?? 0) + Math.max(0, deltaSeconds);
    }
  }

  const rows = await trx('assets')
    .where({ id: assetId, organization_id: organizationId })
    .update(updates)
    .returning([
      'id',
      'organization_id',
      'location_id',
      'parent_asset_id',
      'asset_type_id',
      'code',
      'name',
      'image_url',
      'active',
      'current_state',
      'running_since',
      'runtime_seconds',
      'attributes_json',
      'created_at',
      'updated_at'
    ]);

  return rows[0] ?? null;
}

export async function insertAssetEvent(
  trx,
  { organizationId, assetId, eventType, occurredAt, fromLocationId, toLocationId, fromState, toState, note, metaJson, createdByUserId }
) {
  const rows = await trx('asset_events')
    .insert({
      organization_id: organizationId,
      asset_id: assetId,
      event_type: eventType,
      occurred_at: occurredAt ?? trx.fn.now(),
      from_location_id: fromLocationId ?? null,
      to_location_id: toLocationId ?? null,
      from_state: fromState ?? null,
      to_state: toState ?? null,
      note: note ?? null,
      meta_json: metaJson ?? null,
      created_by_user_id: createdByUserId ?? null
    })
    .returning([
      'id',
      'organization_id',
      'asset_id',
      'event_type',
      'occurred_at',
      'from_location_id',
      'to_location_id',
      'from_state',
      'to_state',
      'note',
      'meta_json',
      'created_by_user_id',
      'created_at',
      'updated_at'
    ]);

  return rows[0];
}

export async function listAssetEvents(organizationId, assetId, { limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  return db('asset_events')
    .where({ organization_id: organizationId, asset_id: assetId })
    .select([
      'id',
      'organization_id',
      'asset_id',
      'event_type',
      'occurred_at',
      'from_location_id',
      'to_location_id',
      'from_state',
      'to_state',
      'note',
      'meta_json',
      'created_by_user_id',
      'created_at',
      'updated_at'
    ])
    .orderBy([{ column: 'occurred_at', order: 'desc' }, { column: 'id', order: 'desc' }])
    .limit(safeLimit);
}
