import db from '../db/knex.js';
import { buildPaginationMeta } from '../utils/pagination.js';

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
    dbOrTrx.raw('iic.specification as specification')
  ];
}

function inventoryItemQueryWithCards(dbOrTrx) {
  return dbOrTrx('inventory_items as ii').leftJoin({ iic: 'inventory_item_cards' }, function joinInventoryItemCard() {
    this.on('iic.id', '=', 'ii.inventory_item_card_id').andOn('iic.organization_id', '=', 'ii.organization_id');
  });
}

export async function listInventoryItemsByOrganization(
  organizationId,
  { warehouseTypeId, warehouseTypeCode, q, code, name, description, brand, model, typeName, specification, sortField, sortOrder, page, pageSize } = {}
) {
  const query = inventoryItemQueryWithCards(db)
    .where({ 'ii.organization_id': organizationId })
    .orderBy(resolveInventoryItemOrder(sortField, sortOrder))
    .select(inventoryItemSelectColumns(db));

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

  applyInventoryItemTextFilters(query, { q, code, name, description, brand, model, typeName, specification });

  if (!Number.isFinite(page) || !Number.isFinite(pageSize)) return query;

  const [{ count }] = await query.clone().clearSelect().clearOrder().countDistinct({ count: 'ii.id' });
  const rows = await query.clone().limit(pageSize).offset((page - 1) * pageSize);
  return { rows, pagination: buildPaginationMeta(count, page, pageSize) };
}

function applyInventoryItemTextFilters(query, { q, code, name, description, brand, model, typeName, specification }) {
  const globalText = normalizeSearchText(q);
  if (globalText) {
    query.andWhere((builder) =>
      builder
        .whereRaw('ii.code ilike ?', [`%${globalText}%`])
        .orWhereRaw('ii.name ilike ?', [`%${globalText}%`])
        .orWhereRaw('ii.description ilike ?', [`%${globalText}%`])
        .orWhereRaw('ii.brand ilike ?', [`%${globalText}%`])
        .orWhereRaw('ii.model ilike ?', [`%${globalText}%`])
        .orWhereRaw('iic.type_name ilike ?', [`%${globalText}%`])
        .orWhereRaw('iic.specification ilike ?', [`%${globalText}%`])
    );
  }

  const filters = [
    ['ii.code', code],
    ['ii.name', name],
    ['ii.description', description],
    ['ii.brand', brand],
    ['ii.model', model],
    ['iic.type_name', typeName],
    ['iic.specification', specification]
  ];

  for (const [column, value] of filters) {
    const text = normalizeSearchText(value);
    if (text) query.andWhereRaw(`${column} ilike ?`, [`%${text}%`]);
  }
}

function normalizeSearchText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function resolveInventoryItemOrder(sortField, sortOrder) {
  const direction = String(sortOrder ?? '').toLowerCase() === 'desc' ? 'desc' : 'asc';
  const columnMap = {
    code: 'ii.code',
    name: 'ii.name',
    brand: 'ii.brand',
    model: 'ii.model',
    type_name: 'iic.type_name',
    specification: 'iic.specification',
    amount_unit_id: 'ii.amount_unit_id'
  };
  const column = columnMap[sortField] ?? 'ii.name';

  return [
    { column, order: direction },
    { column: 'ii.id', order: 'asc' }
  ];
}

export async function getInventoryItemById(id) {
  return inventoryItemQueryWithCards(db).where({ 'ii.id': id }).first(inventoryItemSelectColumns(db));
}

export async function createInventoryItem(
  trx,
  { organizationId, inventoryItemCardId, warehouseTypeId, code, name, description, brand, model, attributesJson, unitId }
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
      amount_unit_id: unitId
    })
    .returning(['id']);

  const insertedId = rows[0]?.id ?? null;
  if (!insertedId) return null;
  return inventoryItemQueryWithCards(trx).where({ 'ii.id': insertedId }).first(inventoryItemSelectColumns(trx));
}

export async function updateInventoryItem(
  trx,
  { organizationId, inventoryItemId, warehouseTypeId, inventoryItemCardId, code, name, description, brand, model, attributesJson, unitId }
) {
  const patch = {
    code,
    name,
    description: description ?? null,
    brand: brand ?? null,
    model: model ?? null,
    attributes_json: attributesJson ?? null,
    amount_unit_id: unitId,
    updated_at: trx.fn.now()
  };
  if (warehouseTypeId != null) {
    patch.warehouse_type_id = warehouseTypeId;
  }
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

export async function deleteInventoryItem(trx, { organizationId, inventoryItemId }) {
  const rows = await trx('inventory_items')
    .where({ id: inventoryItemId, organization_id: organizationId })
    .del()
    .returning(['id']);
  return rows[0] ?? null;
}
