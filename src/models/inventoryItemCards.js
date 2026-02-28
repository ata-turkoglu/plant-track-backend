import db from '../db/knex.js';

const INVENTORY_ITEM_CARD_COLUMNS = [
  'id',
  'organization_id',
  'warehouse_type_id',
  'amount_unit_id',
  'code',
  'name',
  'type_spec',
  'size_spec',
  'size_unit_id',
  'active',
  'created_at',
  'updated_at'
];

export async function listInventoryItemCardsByOrganization(organizationId, { active, q, warehouseTypeId, warehouseTypeCode } = {}) {
  const query = db('inventory_item_cards')
    .where({ organization_id: organizationId })
    .select(INVENTORY_ITEM_CARD_COLUMNS)
    .orderBy([
      { column: 'active', order: 'desc' },
      { column: 'name', order: 'asc' },
      { column: 'id', order: 'asc' }
    ]);

  if (typeof active === 'boolean') query.andWhere({ active });

  const qText = typeof q === 'string' ? q.trim() : '';
  if (qText) {
    query.andWhere((b) =>
      b
        .whereRaw('code ilike ?', [`%${qText}%`])
        .orWhereRaw('name ilike ?', [`%${qText}%`])
        .orWhereRaw('type_spec ilike ?', [`%${qText}%`])
        .orWhereRaw('size_spec ilike ?', [`%${qText}%`])
    );
  }

  const parsedWarehouseTypeId = Number(warehouseTypeId);
  if (Number.isFinite(parsedWarehouseTypeId) && parsedWarehouseTypeId > 0) {
    query.andWhere({ warehouse_type_id: parsedWarehouseTypeId });
  }

  const warehouseTypeCodeText = typeof warehouseTypeCode === 'string' ? warehouseTypeCode.trim() : '';
  if (warehouseTypeCodeText) {
    query.whereIn(
      'warehouse_type_id',
      db('warehouse_types')
        .where({ organization_id: organizationId })
        .whereRaw('lower(code) = lower(?)', [warehouseTypeCodeText])
        .select(['id'])
    );
  }

  return query;
}

export async function getInventoryItemCardById(id) {
  return db('inventory_item_cards').where({ id }).first(INVENTORY_ITEM_CARD_COLUMNS);
}

export async function createInventoryItemCard(
  trx,
  { organizationId, warehouseTypeId, amountUnitId, code, name, typeSpec, sizeSpec, sizeUnitId, active }
) {
  const rows = await trx('inventory_item_cards')
    .insert({
      organization_id: organizationId,
      warehouse_type_id: warehouseTypeId,
      amount_unit_id: amountUnitId,
      code,
      name,
      type_spec: typeSpec ?? null,
      size_spec: sizeSpec ?? null,
      size_unit_id: sizeUnitId ?? null,
      active: active ?? true
    })
    .returning(['id']);

  const insertedId = rows[0]?.id ?? null;
  if (!insertedId) return null;

  return trx('inventory_item_cards')
    .where({ id: insertedId, organization_id: organizationId })
    .first(INVENTORY_ITEM_CARD_COLUMNS);
}

export async function updateInventoryItemCard(
  trx,
  { organizationId, inventoryItemCardId, warehouseTypeId, amountUnitId, code, name, typeSpec, sizeSpec, sizeUnitId, active }
) {
  const rows = await trx('inventory_item_cards')
    .where({ id: inventoryItemCardId, organization_id: organizationId })
    .update({
      warehouse_type_id: warehouseTypeId,
      amount_unit_id: amountUnitId,
      code,
      name,
      type_spec: typeSpec ?? null,
      size_spec: sizeSpec ?? null,
      size_unit_id: sizeUnitId ?? null,
      active: active ?? true,
      updated_at: trx.fn.now()
    })
    .returning(['id']);

  const updatedId = rows[0]?.id ?? null;
  if (!updatedId) return null;

  return trx('inventory_item_cards')
    .where({ id: updatedId, organization_id: organizationId })
    .first(INVENTORY_ITEM_CARD_COLUMNS);
}

export async function setInventoryItemCardActive(trx, { organizationId, inventoryItemCardId, active }) {
  const rows = await trx('inventory_item_cards')
    .where({ id: inventoryItemCardId, organization_id: organizationId })
    .update({ active, updated_at: trx.fn.now() })
    .returning(['id']);

  const updatedId = rows[0]?.id ?? null;
  if (!updatedId) return null;

  return trx('inventory_item_cards')
    .where({ id: updatedId, organization_id: organizationId })
    .first(INVENTORY_ITEM_CARD_COLUMNS);
}

export async function deleteInventoryItemCard(trx, { organizationId, inventoryItemCardId }) {
  return trx('inventory_item_cards').where({ id: inventoryItemCardId, organization_id: organizationId }).del();
}
