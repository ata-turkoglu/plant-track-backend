import db from '../db/knex.js';
import { buildPaginationMeta } from '../utils/pagination.js';

const INVENTORY_ITEM_CARD_COLUMNS = [
  'id',
  'organization_id',
  'warehouse_type_id',
  'amount_unit_id',
  'code',
  'name',
  'type_name',
  'specification',
  'active',
  'created_at',
  'updated_at'
];

const INVENTORY_ITEM_CARD_FIELD_COLUMNS = [
  'id',
  'organization_id',
  'inventory_item_card_id',
  'name',
  'label',
  'data_type',
  'required',
  'unit_id',
  'sort_order',
  'active',
  'created_at',
  'updated_at'
];

function attachFields(inventoryItemCards, fieldRows) {
  const grouped = new Map();

  for (const field of fieldRows) {
    const list = grouped.get(field.inventory_item_card_id) ?? [];
    list.push(field);
    grouped.set(field.inventory_item_card_id, list);
  }

  return inventoryItemCards.map((row) => ({
    ...row,
    fields: grouped.get(row.id) ?? []
  }));
}

async function listInventoryItemCardFieldsByIds(dbOrTrx, organizationId, inventoryItemCardIds) {
  if (inventoryItemCardIds.length === 0) return [];

  return dbOrTrx('inventory_item_card_fields')
    .where({ organization_id: organizationId })
    .whereIn('inventory_item_card_id', inventoryItemCardIds)
    .select(INVENTORY_ITEM_CARD_FIELD_COLUMNS)
    .orderBy([
      { column: 'inventory_item_card_id', order: 'asc' },
      { column: 'sort_order', order: 'asc' },
      { column: 'id', order: 'asc' }
    ]);
}

async function replaceInventoryItemCardFields(trx, { organizationId, inventoryItemCardId, fields }) {
  const hasFieldsTable = await trx.schema.hasTable('inventory_item_card_fields');
  if (!hasFieldsTable) return [];

  await trx('inventory_item_card_fields')
    .where({ organization_id: organizationId, inventory_item_card_id: inventoryItemCardId })
    .del();

  if (!Array.isArray(fields) || fields.length === 0) return [];

  const rows = await trx('inventory_item_card_fields')
    .insert(
      fields.map((field, index) => ({
        organization_id: organizationId,
        inventory_item_card_id: inventoryItemCardId,
        name: field.name,
        label: field.label,
        data_type: field.dataType,
        required: field.required,
        unit_id: field.unitId,
        sort_order: Number.isFinite(field.sortOrder) ? field.sortOrder : index,
        active: field.active ?? true
      }))
    )
    .returning(INVENTORY_ITEM_CARD_FIELD_COLUMNS);

  return rows.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
}

export async function listInventoryItemCardsByOrganization(
  organizationId,
  { active, q, code, name, typeName, specification, warehouseTypeId, warehouseTypeIds, warehouseTypeCode, sortField, sortOrder, page, pageSize } = {}
) {
  const query = db('inventory_item_cards')
    .where({ organization_id: organizationId })
    .select(INVENTORY_ITEM_CARD_COLUMNS)
    .orderBy(resolveInventoryItemCardOrder(sortField, sortOrder));

  if (typeof active === 'boolean') query.andWhere({ active });

  const qText = typeof q === 'string' ? q.trim() : '';
  if (qText) {
    query.andWhere((b) =>
      b
        .whereRaw('code ilike ?', [`%${qText}%`])
        .orWhereRaw('name ilike ?', [`%${qText}%`])
        .orWhereRaw('type_name ilike ?', [`%${qText}%`])
        .orWhereRaw('specification ilike ?', [`%${qText}%`])
    );
  }

  const codeText = normalizeSearchText(code);
  if (codeText) query.andWhereRaw('code ilike ?', [`%${codeText}%`]);

  const nameText = normalizeSearchText(name);
  if (nameText) query.andWhereRaw('name ilike ?', [`%${nameText}%`]);

  const typeNameText = normalizeSearchText(typeName);
  if (typeNameText) query.andWhereRaw('type_name ilike ?', [`%${typeNameText}%`]);

  const specificationText = normalizeSearchText(specification);
  if (specificationText) query.andWhereRaw('specification ilike ?', [`%${specificationText}%`]);

  const parsedWarehouseTypeId = Number(warehouseTypeId);
  if (Number.isFinite(parsedWarehouseTypeId) && parsedWarehouseTypeId > 0) {
    query.andWhere({ warehouse_type_id: parsedWarehouseTypeId });
  }

  const parsedWarehouseTypeIds = Array.isArray(warehouseTypeIds)
    ? warehouseTypeIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  if (parsedWarehouseTypeIds.length > 0) {
    query.whereIn('warehouse_type_id', parsedWarehouseTypeIds);
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

  if (!Number.isFinite(page) || !Number.isFinite(pageSize)) {
    const rows = await query;
    const hasFieldsTable = await db.schema.hasTable('inventory_item_card_fields');
    if (!hasFieldsTable) return rows.map((row) => ({ ...row, fields: [] }));

    const fields = await listInventoryItemCardFieldsByIds(db, organizationId, rows.map((row) => row.id));
    return attachFields(rows, fields);
  }

  const [{ count }] = await query.clone().clearSelect().clearOrder().count({ count: 'id' });
  const rows = await query.clone().limit(pageSize).offset((page - 1) * pageSize);
  const hasFieldsTable = await db.schema.hasTable('inventory_item_card_fields');
  if (!hasFieldsTable) {
    return {
      rows: rows.map((row) => ({ ...row, fields: [] })),
      pagination: buildPaginationMeta(count, page, pageSize)
    };
  }

  const fields = await listInventoryItemCardFieldsByIds(db, organizationId, rows.map((row) => row.id));
  return {
    rows: attachFields(rows, fields),
    pagination: buildPaginationMeta(count, page, pageSize)
  };
}

function normalizeSearchText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function resolveInventoryItemCardOrder(sortField, sortOrder) {
  const direction = String(sortOrder ?? '').toLowerCase() === 'desc' ? 'desc' : 'asc';
  const columnMap = {
    code: 'code',
    name: 'name',
    type_name: 'type_name',
    specification: 'specification',
    amount_unit_id: 'amount_unit_id',
    warehouse_type_id: 'warehouse_type_id',
    active: 'active'
  };
  const column = columnMap[sortField] ?? 'name';

  return [
    { column: 'active', order: 'desc' },
    { column, order: direction },
    { column: 'id', order: 'asc' }
  ];
}

export async function getInventoryItemCardById(id) {
  const row = await db('inventory_item_cards').where({ id }).first(INVENTORY_ITEM_CARD_COLUMNS);
  if (!row) return null;

  const hasFieldsTable = await db.schema.hasTable('inventory_item_card_fields');
  if (!hasFieldsTable) return { ...row, fields: [] };

  const fields = await listInventoryItemCardFieldsByIds(db, row.organization_id, [row.id]);
  return attachFields([row], fields)[0] ?? null;
}

export async function createInventoryItemCard(
  trx,
  { organizationId, warehouseTypeId, amountUnitId, code, name, typeName, specification, active, fields }
) {
  const rows = await trx('inventory_item_cards')
    .insert({
      organization_id: organizationId,
      warehouse_type_id: warehouseTypeId,
      amount_unit_id: amountUnitId,
      code,
      name,
      type_name: typeName ?? null,
      specification: specification ?? null,
      active: active ?? true
    })
    .returning(['id']);

  const insertedId = rows[0]?.id ?? null;
  if (!insertedId) return null;

  const inventoryItemCard = await trx('inventory_item_cards')
    .where({ id: insertedId, organization_id: organizationId })
    .first(INVENTORY_ITEM_CARD_COLUMNS);

  if (!inventoryItemCard) return null;

  const fieldRows = await replaceInventoryItemCardFields(trx, { organizationId, inventoryItemCardId: insertedId, fields });
  return { ...inventoryItemCard, fields: fieldRows };
}

export async function updateInventoryItemCard(
  trx,
  { organizationId, inventoryItemCardId, warehouseTypeId, amountUnitId, code, name, typeName, specification, active, fields }
) {
  const rows = await trx('inventory_item_cards')
    .where({ id: inventoryItemCardId, organization_id: organizationId })
    .update({
      warehouse_type_id: warehouseTypeId,
      amount_unit_id: amountUnitId,
      code,
      name,
      type_name: typeName ?? null,
      specification: specification ?? null,
      active: active ?? true,
      updated_at: trx.fn.now()
    })
    .returning(['id']);

  const updatedId = rows[0]?.id ?? null;
  if (!updatedId) return null;

  const inventoryItemCard = await trx('inventory_item_cards')
    .where({ id: updatedId, organization_id: organizationId })
    .first(INVENTORY_ITEM_CARD_COLUMNS);

  if (!inventoryItemCard) return null;

  const fieldRows = await replaceInventoryItemCardFields(trx, { organizationId, inventoryItemCardId, fields });
  return { ...inventoryItemCard, fields: fieldRows };
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
