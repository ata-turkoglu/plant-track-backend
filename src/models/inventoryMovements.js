import db from '../db/knex.js';

export async function listMovementsByOrganization(organizationId, limit = 100) {
  return db('inventory_movement_lines')
    .from({ l: 'inventory_movement_lines' })
    .join({ e: 'inventory_movement_events' }, 'e.id', 'l.event_id')
    .leftJoin({ i: 'items' }, 'i.id', 'l.item_id')
    .leftJoin({ u: 'units' }, 'u.id', 'l.unit_id')
    .leftJoin({ fn: 'nodes' }, 'fn.id', 'l.from_node_id')
    .leftJoin({ tn: 'nodes' }, 'tn.id', 'l.to_node_id')
    .leftJoin({ fw: 'warehouses' }, function joinFromWarehouse() {
      this.on('fw.organization_id', '=', 'l.organization_id')
        .andOn('fn.node_type', '=', db.raw("'WAREHOUSE'"))
        .andOn('fn.ref_table', '=', db.raw("'warehouses'"))
        .andOn('fw.id', '=', db.raw('cast(fn.ref_id as integer)'));
    })
    .leftJoin({ tw: 'warehouses' }, function joinToWarehouse() {
      this.on('tw.organization_id', '=', 'l.organization_id')
        .andOn('tn.node_type', '=', db.raw("'WAREHOUSE'"))
        .andOn('tn.ref_table', '=', db.raw("'warehouses'"))
        .andOn('tw.id', '=', db.raw('cast(tn.ref_id as integer)'));
    })
    .where('l.organization_id', organizationId)
    .orderBy([{ column: 'e.occurred_at', order: 'desc' }, { column: 'l.id', order: 'desc' }])
    .limit(limit)
    .select([
      'l.id',
      'l.organization_id',
      db.raw('e.id::text as movement_group_id'),
      'l.item_id',
      db.raw('e.event_type as movement_type'),
      'l.quantity',
      db.raw('u.code as uom'),
      'e.reference_type',
      'e.reference_id',
      'e.note',
      'e.occurred_at',
      'l.from_node_id',
      'l.to_node_id',
      db.raw('fn.node_type as from_node_type'),
      db.raw('fn.name as from_node_name'),
      db.raw('tn.node_type as to_node_type'),
      db.raw('tn.name as to_node_name'),
      db.raw('fn.node_type as from_kind'),
      db.raw('fn.name as from_ref'),
      db.raw('tn.node_type as to_kind'),
      db.raw('tn.name as to_ref'),
      db.raw('coalesce(tw.id, fw.id) as warehouse_id'),
      db.raw('null::integer as location_id'),
      db.raw('i.code as item_code'),
      db.raw('i.name as item_name'),
      db.raw("coalesce(tw.name, fw.name, '-') as warehouse_name"),
      db.raw("null::text as location_name"),
      db.raw('e.status as status'),
      db.raw('e.event_type as event_type')
    ]);
}

export async function createMovementEvent(
  trx,
  { organizationId, eventType, status = 'DRAFT', occurredAt, referenceType, referenceId, note, createdByUserId, lines }
) {
  const eventRows = await trx('inventory_movement_events')
    .insert({
      organization_id: organizationId,
      event_type: eventType,
      status,
      occurred_at: occurredAt ?? trx.fn.now(),
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
      note: note ?? null,
      created_by_user_id: createdByUserId ?? null
    })
    .returning(['id', 'organization_id', 'event_type', 'status', 'occurred_at', 'reference_type', 'reference_id', 'note']);

  const event = eventRows[0];

  const lineRows = await trx('inventory_movement_lines')
    .insert(
      lines.map((line, index) => ({
        event_id: event.id,
        organization_id: organizationId,
        line_no: index + 1,
        item_id: line.itemId,
        unit_id: line.unitId,
        from_node_id: line.fromNodeId,
        to_node_id: line.toNodeId,
        quantity: line.quantity
      }))
    )
    .returning(['id', 'event_id', 'organization_id', 'line_no', 'item_id', 'unit_id', 'from_node_id', 'to_node_id', 'quantity']);

  return { event, lines: lineRows };
}

export async function getMovementLineById(organizationId, lineId) {
  return db('inventory_movement_lines')
    .from({ l: 'inventory_movement_lines' })
    .join({ e: 'inventory_movement_events' }, 'e.id', 'l.event_id')
    .where({ 'l.id': lineId, 'l.organization_id': organizationId })
    .first([
      'l.id',
      'l.event_id',
      'l.organization_id',
      'l.item_id',
      'l.unit_id',
      'l.from_node_id',
      'l.to_node_id',
      'l.quantity',
      'e.status',
      'e.event_type',
      'e.reference_type',
      'e.reference_id',
      'e.note',
      'e.occurred_at'
    ]);
}

export async function updateDraftMovementLine(
  trx,
  {
    organizationId,
    lineId,
    eventType,
    occurredAt,
    referenceType,
    referenceId,
    note,
    itemId,
    unitId,
    fromNodeId,
    toNodeId,
    quantity
  }
) {
  const existing = await trx('inventory_movement_lines')
    .from({ l: 'inventory_movement_lines' })
    .join({ e: 'inventory_movement_events' }, 'e.id', 'l.event_id')
    .where({ 'l.id': lineId, 'l.organization_id': organizationId })
    .first(['l.id', 'l.event_id', 'e.status']);

  if (!existing) return null;
  if (existing.status !== 'DRAFT') return { immutable: true };

  await trx('inventory_movement_events')
    .where({ id: existing.event_id, organization_id: organizationId })
    .update({
      event_type: eventType,
      occurred_at: occurredAt ?? trx.fn.now(),
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
      note: note ?? null,
      updated_at: trx.fn.now()
    });

  const lineRows = await trx('inventory_movement_lines')
    .where({ id: lineId, organization_id: organizationId })
    .update({
      item_id: itemId,
      unit_id: unitId,
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      quantity,
      updated_at: trx.fn.now()
    })
    .returning(['id', 'event_id', 'organization_id', 'item_id', 'unit_id', 'from_node_id', 'to_node_id', 'quantity']);

  return { line: lineRows[0] };
}

export async function deleteDraftMovementLine(trx, { organizationId, lineId }) {
  const existing = await trx('inventory_movement_lines')
    .from({ l: 'inventory_movement_lines' })
    .join({ e: 'inventory_movement_events' }, 'e.id', 'l.event_id')
    .where({ 'l.id': lineId, 'l.organization_id': organizationId })
    .first(['l.id', 'l.event_id', 'e.status']);

  if (!existing) return null;
  if (existing.status !== 'DRAFT') return { immutable: true };

  await trx('inventory_movement_lines').where({ id: lineId, organization_id: organizationId }).del();

  const remains = await trx('inventory_movement_lines').where({ event_id: existing.event_id }).first(['id']);
  if (!remains) {
    await trx('inventory_movement_events').where({ id: existing.event_id, organization_id: organizationId }).del();
  }

  return { ok: true };
}

export async function listBalancesByOrganization(
  organizationId,
  { nodeIds = [], itemIds = [], fromDate, toDate, statuses = ['POSTED'] } = {}
) {
  const ledger = db.raw(
    `(select l.organization_id, l.item_id, l.to_node_id as node_id, l.quantity::numeric as delta, e.occurred_at, e.status
      from inventory_movement_lines l
      join inventory_movement_events e on e.id = l.event_id
      where l.organization_id = ?
      union all
      select l.organization_id, l.item_id, l.from_node_id as node_id, (-l.quantity)::numeric as delta, e.occurred_at, e.status
      from inventory_movement_lines l
      join inventory_movement_events e on e.id = l.event_id
      where l.organization_id = ?) as l`,
    [organizationId, organizationId]
  );

  const query = db
    .from(ledger)
    .leftJoin({ n: 'nodes' }, 'n.id', 'l.node_id')
    .leftJoin({ i: 'items' }, 'i.id', 'l.item_id')
    .leftJoin({ u: 'units' }, 'u.id', 'i.unit_id')
    .where('l.organization_id', organizationId)
    .groupBy(['l.organization_id', 'l.node_id', 'n.node_type', 'n.name', 'l.item_id', 'i.code', 'i.name', 'u.code'])
    .select([
      'l.organization_id',
      'l.node_id',
      db.raw('n.node_type'),
      db.raw('n.name as node_name'),
      'l.item_id',
      db.raw('i.code as item_code'),
      db.raw('i.name as item_name'),
      db.raw('u.code as unit_code'),
      db.raw('sum(l.delta) as balance_qty')
    ])
    .havingRaw('sum(l.delta) <> 0')
    .orderBy([
      { column: 'n.node_type', order: 'asc' },
      { column: 'n.name', order: 'asc' },
      { column: 'i.code', order: 'asc' }
    ]);

  if (statuses.length > 0) query.whereIn('l.status', statuses);
  if (nodeIds.length > 0) query.whereIn('l.node_id', nodeIds);
  if (itemIds.length > 0) query.whereIn('l.item_id', itemIds);
  if (fromDate) query.where('l.occurred_at', '>=', fromDate);
  if (toDate) query.where('l.occurred_at', '<=', toDate);

  return query;
}
