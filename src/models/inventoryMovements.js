import db from '../db/knex.js';

export async function listMovementsByOrganization(organizationId, limit = 100) {
  return db('inventory_movements')
    .from({ m: 'inventory_movements' })
    .leftJoin({ i: 'items' }, 'i.id', 'm.item_id')
    .leftJoin({ w: 'warehouses' }, 'w.id', 'm.warehouse_id')
    .leftJoin({ l: 'locations' }, 'l.id', 'm.location_id')
    .where({ 'm.organization_id': organizationId })
    .orderBy([{ column: 'm.occurred_at', order: 'desc' }, { column: 'm.id', order: 'desc' }])
    .limit(limit)
    .select([
      'm.id',
      'm.organization_id',
      'm.warehouse_id',
      'm.location_id',
      'm.item_id',
      'm.movement_type',
      'm.quantity',
      'm.uom',
      'm.reference_type',
      'm.reference_id',
      'm.note',
      'm.occurred_at',
      db.raw('i.code as item_code'),
      db.raw('i.name as item_name'),
      db.raw('w.name as warehouse_name'),
      db.raw('l.name as location_name')
    ]);
}

export async function createMovement(
  trx,
  {
    organizationId,
    warehouseId,
    locationId,
    itemId,
    movementType,
    quantity,
    uom,
    referenceType,
    referenceId,
    note,
    occurredAt,
    createdByUserId
  }
) {
  const rows = await trx('inventory_movements')
    .insert({
      organization_id: organizationId,
      warehouse_id: warehouseId,
      location_id: locationId ?? null,
      item_id: itemId,
      movement_type: movementType,
      quantity,
      uom,
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
      note: note ?? null,
      occurred_at: occurredAt ?? trx.fn.now(),
      created_by_user_id: createdByUserId ?? null
    })
    .returning([
      'id',
      'organization_id',
      'warehouse_id',
      'location_id',
      'item_id',
      'movement_type',
      'quantity',
      'uom',
      'reference_type',
      'reference_id',
      'note',
      'occurred_at'
    ]);

  return rows[0];
}

export async function updateMovement(
  trx,
  { organizationId, movementId, warehouseId, locationId, itemId, movementType, quantity, uom, referenceType, referenceId, note, occurredAt }
) {
  const rows = await trx('inventory_movements')
    .where({ id: movementId, organization_id: organizationId })
    .update({
      warehouse_id: warehouseId,
      location_id: locationId ?? null,
      item_id: itemId,
      movement_type: movementType,
      quantity,
      uom,
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
      note: note ?? null,
      occurred_at: occurredAt ?? trx.fn.now(),
      updated_at: trx.fn.now()
    })
    .returning([
      'id',
      'organization_id',
      'warehouse_id',
      'location_id',
      'item_id',
      'movement_type',
      'quantity',
      'uom',
      'reference_type',
      'reference_id',
      'note',
      'occurred_at'
    ]);

  return rows[0] ?? null;
}

export async function deleteMovement(trx, { organizationId, movementId }) {
  const rows = await trx('inventory_movements')
    .where({ id: movementId, organization_id: organizationId })
    .del()
    .returning(['id']);

  return rows[0] ?? null;
}
