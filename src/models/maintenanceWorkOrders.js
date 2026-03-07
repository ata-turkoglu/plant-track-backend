import db from '../db/knex.js';
import { buildPaginationMeta } from '../utils/pagination.js';

const WORK_ORDER_COLUMNS = [
  'mwo.id',
  'mwo.organization_id',
  'mwo.asset_id',
  'mwo.type',
  'mwo.status',
  'mwo.priority',
  'mwo.title',
  'mwo.symptom',
  'mwo.note',
  'mwo.root_cause',
  'mwo.resolution_note',
  'mwo.planned_at',
  'mwo.opened_at',
  'mwo.started_at',
  'mwo.completed_at',
  'mwo.assigned_firm_id',
  'mwo.invoice_no',
  'mwo.invoice_amount',
  'mwo.created_by_user_id',
  'mwo.closed_by_user_id',
  'mwo.created_at',
  'mwo.updated_at',
  db.raw('a.code as asset_code'),
  db.raw('a.name as asset_name'),
  db.raw('a.current_state as asset_current_state'),
  db.raw('f.name as assigned_firm_name'),
  db.raw('(select count(*)::int from maintenance_work_order_parts mwop where mwop.work_order_id = mwo.id) as part_count'),
  db.raw(`(
    select string_agg(distinct ii.name, ', ' order by ii.name)
    from maintenance_work_order_parts mwop
    join inventory_items ii on ii.id = mwop.inventory_item_id and ii.organization_id = mwop.organization_id
    where mwop.work_order_id = mwo.id
  ) as part_names`)
];

const WORK_ORDER_RETURNING_COLUMNS = [
  'id',
  'organization_id',
  'asset_id',
  'type',
  'status',
  'priority',
  'title',
  'symptom',
  'note',
  'root_cause',
  'resolution_note',
  'planned_at',
  'opened_at',
  'started_at',
  'completed_at',
  'assigned_firm_id',
  'invoice_no',
  'invoice_amount',
  'created_by_user_id',
  'closed_by_user_id',
  'created_at',
  'updated_at'
];

const PART_COLUMNS = [
  'mwop.id',
  'mwop.organization_id',
  'mwop.work_order_id',
  'mwop.inventory_item_id',
  'mwop.amount_unit_id',
  'mwop.source_node_id',
  'mwop.quantity',
  'mwop.note',
  'mwop.movement_event_id',
  'mwop.created_at',
  'mwop.updated_at',
  db.raw('ii.code as inventory_item_code'),
  db.raw('ii.name as inventory_item_name'),
  db.raw('u.code as unit_code'),
  db.raw('u.name as unit_name'),
  db.raw('u.symbol as unit_symbol'),
  db.raw('n.name as source_node_name')
];

function baseWorkOrderQuery(organizationId) {
  return db('maintenance_work_orders as mwo')
    .leftJoin({ a: 'assets' }, function joinAsset() {
      this.on('a.id', '=', 'mwo.asset_id').andOn('a.organization_id', '=', 'mwo.organization_id');
    })
    .leftJoin({ f: 'firms' }, function joinFirm() {
      this.on('f.id', '=', 'mwo.assigned_firm_id').andOn('f.organization_id', '=', 'mwo.organization_id');
    })
    .where('mwo.organization_id', organizationId);
}

async function resolveLocationScopeIds(organizationId, locationId) {
  const targetLocationId = Number(locationId);
  if (!Number.isFinite(targetLocationId) || targetLocationId <= 0) return [];

  const locations = await db('locations')
    .where({ organization_id: organizationId })
    .select(['id', 'parent_id']);

  const locationIds = new Set(locations.map((row) => row.id));
  if (!locationIds.has(targetLocationId)) return [];

  const childrenByParentId = new Map();
  for (const location of locations) {
    const parentId = location.parent_id ?? null;
    const current = childrenByParentId.get(parentId) ?? [];
    current.push(location.id);
    childrenByParentId.set(parentId, current);
  }

  const scopedIds = [];
  const queue = [targetLocationId];
  const visited = new Set();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!Number.isFinite(currentId) || visited.has(currentId)) continue;
    visited.add(currentId);
    scopedIds.push(currentId);

    const children = childrenByParentId.get(currentId) ?? [];
    for (const childId of children) {
      if (!visited.has(childId)) queue.push(childId);
    }
  }

  return scopedIds;
}

export async function listMaintenanceWorkOrdersByOrganization(
  organizationId,
  { q, status, type, priority, assetId, locationId, assignedFirmId, title, assetName, page, pageSize } = {}
) {
  const query = baseWorkOrderQuery(organizationId)
    .select(WORK_ORDER_COLUMNS)
    .orderBy([
      { column: 'mwo.opened_at', order: 'desc' },
      { column: 'mwo.id', order: 'desc' }
    ]);

  const globalText = typeof q === 'string' ? q.trim() : '';
  if (globalText) {
    query.andWhere((builder) =>
      builder
        .whereRaw('mwo.title ilike ?', [`%${globalText}%`])
        .orWhereRaw('coalesce(mwo.symptom, \'\') ilike ?', [`%${globalText}%`])
        .orWhereRaw('coalesce(a.name, \'\') ilike ?', [`%${globalText}%`])
        .orWhereRaw('coalesce(a.code, \'\') ilike ?', [`%${globalText}%`])
    );
  }

  const normalizedStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';
  if (normalizedStatus) query.andWhere('mwo.status', normalizedStatus);

  const normalizedType = typeof type === 'string' ? type.trim().toUpperCase() : '';
  if (normalizedType) query.andWhere('mwo.type', normalizedType);

  const normalizedPriority = typeof priority === 'string' ? priority.trim().toUpperCase() : '';
  if (normalizedPriority) query.andWhere('mwo.priority', normalizedPriority);

  const numericAssetId = Number(assetId);
  if (Number.isFinite(numericAssetId) && numericAssetId > 0) query.andWhere('mwo.asset_id', numericAssetId);

  const numericLocationId = Number(locationId);
  const scopedLocationIds = await resolveLocationScopeIds(organizationId, numericLocationId);
  if (Number.isFinite(numericLocationId) && numericLocationId > 0) {
    if (scopedLocationIds.length === 0) query.andWhereRaw('1=0');
    else query.andWhere((builder) => builder.whereIn('a.location_id', scopedLocationIds));
  }

  const numericAssignedFirmId = Number(assignedFirmId);
  if (Number.isFinite(numericAssignedFirmId) && numericAssignedFirmId > 0) query.andWhere('mwo.assigned_firm_id', numericAssignedFirmId);

  const titleText = typeof title === 'string' ? title.trim() : '';
  if (titleText) query.andWhereRaw('mwo.title ilike ?', [`%${titleText}%`]);

  const assetNameText = typeof assetName === 'string' ? assetName.trim() : '';
  if (assetNameText) {
    query.andWhere((builder) =>
      builder.whereRaw('coalesce(a.name, \'\') ilike ?', [`%${assetNameText}%`]).orWhereRaw('coalesce(a.code, \'\') ilike ?', [`%${assetNameText}%`])
    );
  }

  if (!Number.isFinite(page) || !Number.isFinite(pageSize)) return query;

  const [{ count }] = await query.clone().clearSelect().clearOrder().count({ count: 'mwo.id' });
  const rows = await query.clone().limit(pageSize).offset((page - 1) * pageSize);
  return { rows, pagination: buildPaginationMeta(count, page, pageSize) };
}

export async function listMaintenanceWorkOrdersByAsset(
  organizationId,
  assetId,
  { status, page, pageSize } = {}
) {
  const query = baseWorkOrderQuery(organizationId)
    .andWhere('mwo.asset_id', assetId)
    .select(WORK_ORDER_COLUMNS)
    .orderBy([
      { column: 'mwo.opened_at', order: 'desc' },
      { column: 'mwo.id', order: 'desc' }
    ]);

  const normalizedStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';
  if (normalizedStatus) query.andWhere('mwo.status', normalizedStatus);

  if (!Number.isFinite(page) || !Number.isFinite(pageSize)) return query;

  const [{ count }] = await query.clone().clearSelect().clearOrder().count({ count: 'mwo.id' });
  const rows = await query.clone().limit(pageSize).offset((page - 1) * pageSize);
  return { rows, pagination: buildPaginationMeta(count, page, pageSize) };
}

export async function getMaintenanceWorkOrderById(organizationId, workOrderId) {
  return baseWorkOrderQuery(organizationId)
    .andWhere('mwo.id', workOrderId)
    .first(WORK_ORDER_COLUMNS);
}

export async function listMaintenanceWorkOrderParts(organizationId, workOrderId) {
  return db('maintenance_work_order_parts as mwop')
    .leftJoin({ ii: 'inventory_items' }, function joinItem() {
      this.on('ii.id', '=', 'mwop.inventory_item_id').andOn('ii.organization_id', '=', 'mwop.organization_id');
    })
    .leftJoin({ u: 'units' }, 'u.id', 'mwop.amount_unit_id')
    .leftJoin({ n: 'nodes' }, 'n.id', 'mwop.source_node_id')
    .where({
      'mwop.organization_id': organizationId,
      'mwop.work_order_id': workOrderId
    })
    .select(PART_COLUMNS)
    .orderBy([{ column: 'mwop.id', order: 'asc' }]);
}

export async function createMaintenanceWorkOrder(
  trx,
  {
    organizationId,
    assetId,
    type,
    priority,
    title,
    symptom,
    note,
    plannedAt,
    assignedFirmId,
    createdByUserId
  }
) {
  const rows = await trx('maintenance_work_orders')
    .insert({
      organization_id: organizationId,
      asset_id: assetId,
      type,
      status: 'OPEN',
      priority,
      title,
      symptom: symptom ?? null,
      note: note ?? null,
      planned_at: plannedAt ?? null,
      opened_at: trx.fn.now(),
      assigned_firm_id: assignedFirmId ?? null,
      created_by_user_id: createdByUserId ?? null
    })
    .returning(WORK_ORDER_RETURNING_COLUMNS);

  return rows[0];
}

export async function updateMaintenanceWorkOrder(
  trx,
  {
    organizationId,
    workOrderId,
    type,
    priority,
    title,
    symptom,
    note,
    plannedAt,
    assignedFirmId
  }
) {
  const rows = await trx('maintenance_work_orders')
    .where({
      id: workOrderId,
      organization_id: organizationId
    })
    .update({
      type,
      priority,
      title,
      symptom: symptom ?? null,
      note: note ?? null,
      planned_at: plannedAt ?? null,
      assigned_firm_id: assignedFirmId ?? null,
      updated_at: trx.fn.now()
    })
    .returning(WORK_ORDER_RETURNING_COLUMNS);

  return rows[0] ?? null;
}

export async function startMaintenanceWorkOrder(trx, { organizationId, workOrderId, startedAt }) {
  const rows = await trx('maintenance_work_orders')
    .where({
      id: workOrderId,
      organization_id: organizationId
    })
    .update({
      status: 'IN_PROGRESS',
      started_at: startedAt ?? trx.fn.now(),
      updated_at: trx.fn.now()
    })
    .returning(WORK_ORDER_RETURNING_COLUMNS);

  return rows[0] ?? null;
}

export async function completeMaintenanceWorkOrder(
  trx,
  {
    organizationId,
    workOrderId,
    rootCause,
    resolutionNote,
    invoiceNo,
    invoiceAmount,
    completedAt,
    closedByUserId
  }
) {
  const patch = {
    status: 'DONE',
    root_cause: rootCause ?? null,
    resolution_note: resolutionNote ?? null,
    completed_at: completedAt ?? trx.fn.now(),
    closed_by_user_id: closedByUserId ?? null,
    updated_at: trx.fn.now()
  };
  if (invoiceNo !== undefined) patch.invoice_no = invoiceNo;
  if (invoiceAmount !== undefined) patch.invoice_amount = invoiceAmount;

  const rows = await trx('maintenance_work_orders')
    .where({
      id: workOrderId,
      organization_id: organizationId
    })
    .update(patch)
    .returning(WORK_ORDER_RETURNING_COLUMNS);

  return rows[0] ?? null;
}

export async function insertMaintenanceWorkOrderParts(
  trx,
  {
    organizationId,
    workOrderId,
    movementEventId,
    parts
  }
) {
  if (!parts.length) return [];

  return trx('maintenance_work_order_parts')
    .insert(
      parts.map((part) => ({
        organization_id: organizationId,
        work_order_id: workOrderId,
        inventory_item_id: part.inventoryItemId,
        amount_unit_id: part.unitId,
        source_node_id: part.sourceNodeId,
        quantity: part.quantity,
        note: part.note ?? null,
        movement_event_id: movementEventId ?? null
      }))
    )
    .returning([
      'id',
      'organization_id',
      'work_order_id',
      'inventory_item_id',
      'amount_unit_id',
      'source_node_id',
      'quantity',
      'note',
      'movement_event_id',
      'created_at',
      'updated_at'
    ]);
}
