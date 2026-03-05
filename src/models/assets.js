import db from '../db/knex.js';
import { buildPaginationMeta } from '../utils/pagination.js';

export async function listAssetsByOrganization(
  organizationId,
  { locationId, parentAssetId, assetCardId, assetTypeId, q, name, code, currentState, sortField, sortOrder, page, pageSize } = {}
) {
  const resolvedAssetCardId = assetCardId ?? assetTypeId;
  const query = db('assets')
    .where({ organization_id: organizationId })
    .select([
      'id',
      'organization_id',
      'location_id',
      'parent_asset_id',
      'asset_card_id',
      'code',
      'name',
      'image_url',
      'current_state',
      'running_since',
      'runtime_seconds',
      'attributes_json',
      'created_at',
      'updated_at'
    ])
    .orderBy(resolveAssetOrder(sortField, sortOrder));

  if (Number.isFinite(Number(locationId))) query.andWhere({ location_id: Number(locationId) });
  if (Number.isFinite(Number(resolvedAssetCardId))) query.andWhere({ asset_card_id: Number(resolvedAssetCardId) });

  if (parentAssetId === null) query.whereNull('parent_asset_id');
  if (Number.isFinite(Number(parentAssetId))) query.andWhere({ parent_asset_id: Number(parentAssetId) });

  applyAssetTextFilters(query, { q, name, code, currentState });

  if (!Number.isFinite(page) || !Number.isFinite(pageSize)) return query;

  const [{ count }] = await query.clone().clearSelect().clearOrder().count({ count: 'id' });
  const rows = await query.clone().limit(pageSize).offset((page - 1) * pageSize);
  return { rows, pagination: buildPaginationMeta(count, page, pageSize) };
}

function applyAssetTextFilters(query, { q, name, code, currentState }) {
  const globalText = normalizeSearchText(q);
  if (globalText) {
    query.andWhere((builder) =>
      builder
        .whereRaw('name ilike ?', [`%${globalText}%`])
        .orWhereRaw('code ilike ?', [`%${globalText}%`])
        .orWhereRaw('current_state ilike ?', [`%${globalText}%`])
    );
  }

  const nameText = normalizeSearchText(name);
  if (nameText) query.andWhereRaw('name ilike ?', [`%${nameText}%`]);

  const codeText = normalizeSearchText(code);
  if (codeText) query.andWhereRaw('code ilike ?', [`%${codeText}%`]);

  const currentStateText = normalizeSearchText(currentState);
  if (currentStateText) query.andWhereRaw('current_state ilike ?', [`%${currentStateText}%`]);
}

function normalizeSearchText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function resolveAssetOrder(sortField, sortOrder) {
  const direction = String(sortOrder ?? '').toLowerCase() === 'desc' ? 'desc' : 'asc';
  const columnMap = {
    name: 'name',
    code: 'code',
    current_state: 'current_state',
    runtime_seconds: 'runtime_seconds'
  };
  const column = columnMap[sortField] ?? 'name';

  return [
    { column, order: direction },
    { column: 'id', order: direction }
  ];
}

export async function getAssetById(organizationId, assetId) {
  return db('assets')
    .where({ id: assetId, organization_id: organizationId })
    .first([
      'id',
      'organization_id',
      'location_id',
      'parent_asset_id',
      'asset_card_id',
      'code',
      'name',
      'image_url',
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
  { organizationId, locationId, parentAssetId, assetCardId, assetTypeId, code, name, imageUrl, attributesJson }
) {
  const resolvedAssetCardId = assetCardId ?? assetTypeId;
  const rows = await trx('assets')
    .insert({
      organization_id: organizationId,
      location_id: locationId,
      parent_asset_id: parentAssetId ?? null,
      asset_card_id: resolvedAssetCardId ?? null,
      code: code ?? null,
      name,
      image_url: imageUrl ?? null,
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
      'asset_card_id',
      'code',
      'name',
      'image_url',
      'current_state',
      'running_since',
      'runtime_seconds',
      'attributes_json',
      'created_at',
      'updated_at'
    ]);

  return rows[0];
}

export async function updateAsset(
  trx,
  { organizationId, assetId, parentAssetId, assetCardId, assetTypeId, code, name, imageUrl, attributesJson }
) {
  const resolvedAssetCardId = assetCardId ?? assetTypeId;
  const rows = await trx('assets')
    .where({ id: assetId, organization_id: organizationId })
    .update({
      parent_asset_id: parentAssetId ?? null,
      asset_card_id: resolvedAssetCardId ?? null,
      code: code ?? null,
      name,
      image_url: imageUrl ?? null,
      attributes_json: attributesJson ?? null,
      updated_at: trx.fn.now()
    })
    .returning([
      'id',
      'organization_id',
      'location_id',
      'parent_asset_id',
      'asset_card_id',
      'code',
      'name',
      'image_url',
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
    .first(['id', 'location_id', 'current_state', 'running_since', 'runtime_seconds', 'code', 'name', 'asset_card_id', 'parent_asset_id']);
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
      'asset_card_id',
      'code',
      'name',
      'image_url',
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
      'asset_card_id',
      'code',
      'name',
      'image_url',
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
