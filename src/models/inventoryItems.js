import db from '../db/knex.js';

function inventoryItemSelectColumns(dbOrTrx) {
  return [
    'ii.id',
    'ii.organization_id',
    'ii.inventory_item_card_id',
    'ii.warehouse_type_id',
    'ii.amount_unit_id',
    'ii.code',
    'ii.name',
    'ii.description',
    'ii.brand',
    'ii.model',
    'ii.attributes_json',
    dbOrTrx.raw('iic.code as inventory_item_card_code'),
    dbOrTrx.raw('iic.name as inventory_item_card_name'),
    dbOrTrx.raw('iic.type_name as type_name'),
    dbOrTrx.raw('iic.specification as specification'),
    'ii.active'
  ];
}

function inventoryItemQueryWithCards(dbOrTrx) {
  return dbOrTrx('inventory_items as ii').leftJoin({ iic: 'inventory_item_cards' }, function joinInventoryItemCard() {
    this.on('iic.id', '=', 'ii.inventory_item_card_id').andOn('iic.organization_id', '=', 'ii.organization_id');
  });
}

export async function listInventoryItemsByOrganization(organizationId, { active, warehouseTypeId, warehouseTypeCode } = {}) {
  const query = inventoryItemQueryWithCards(db)
    .where({ 'ii.organization_id': organizationId })
    .orderBy([{ column: 'ii.active', order: 'desc' }, { column: 'ii.name', order: 'asc' }])
    .select(inventoryItemSelectColumns(db));

  if (typeof active === 'boolean') query.andWhere({ 'ii.active': active });

  const parsedWarehouseTypeId = Number(warehouseTypeId);
  if (Number.isFinite(parsedWarehouseTypeId) && parsedWarehouseTypeId > 0) {
    query.andWhere({ 'ii.warehouse_type_id': parsedWarehouseTypeId });
  }

  const warehouseTypeCodeText = typeof warehouseTypeCode === 'string' ? warehouseTypeCode.trim() : '';
  if (warehouseTypeCodeText) {
    query.whereIn(
      'ii.warehouse_type_id',
      db('warehouse_types')
        .where({ organization_id: organizationId })
        .whereRaw('lower(code) = lower(?)', [warehouseTypeCodeText])
        .select(['id'])
    );
  }

  return query;
}

export async function getInventoryItemById(id) {
  return inventoryItemQueryWithCards(db).where({ 'ii.id': id }).first(inventoryItemSelectColumns(db));
}

export async function createInventoryItem(
  trx,
  { organizationId, inventoryItemCardId, warehouseTypeId, code, name, description, brand, model, attributesJson, unitId, active }
) {
  const rows = await trx('inventory_items')
    .insert({
      organization_id: organizationId,
      inventory_item_card_id: inventoryItemCardId,
      warehouse_type_id: warehouseTypeId,
      code,
      name,
      description: description ?? null,
      brand: brand ?? null,
      model: model ?? null,
      attributes_json: attributesJson ?? null,
      amount_unit_id: unitId,
      active: active ?? true
    })
    .returning(['id']);

  const insertedId = rows[0]?.id ?? null;
  if (!insertedId) return null;
  return inventoryItemQueryWithCards(trx).where({ 'ii.id': insertedId }).first(inventoryItemSelectColumns(trx));
}

export async function updateInventoryItem(
  trx,
  { organizationId, inventoryItemId, inventoryItemCardId, code, name, description, brand, model, attributesJson, unitId, active }
) {
  const patch = {
    code,
    name,
    description: description ?? null,
    brand: brand ?? null,
    model: model ?? null,
    attributes_json: attributesJson ?? null,
    amount_unit_id: unitId,
    active,
    updated_at: trx.fn.now()
  };
  if (inventoryItemCardId != null) {
    patch.inventory_item_card_id = inventoryItemCardId;
  }

  const rows = await trx('inventory_items')
    .where({ id: inventoryItemId, organization_id: organizationId })
    .update(patch)
    .returning(['id']);

  const updatedId = rows[0]?.id ?? null;
  if (!updatedId) return null;
  return inventoryItemQueryWithCards(trx).where({ 'ii.id': updatedId }).first(inventoryItemSelectColumns(trx));
}

export async function setInventoryItemActive(trx, { organizationId, inventoryItemId, active }) {
  const rows = await trx('inventory_items')
    .where({ id: inventoryItemId, organization_id: organizationId })
    .update({ active, updated_at: trx.fn.now() })
    .returning(['id']);

  const updated = rows[0] ?? null;
  if (!updated) return null;

  return updated;
}
