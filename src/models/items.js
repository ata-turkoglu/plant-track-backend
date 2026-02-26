import db from '../db/knex.js';

function itemSelectColumns(dbOrTrx) {
  return [
    'i.id',
    'i.organization_id',
    'i.item_group_id',
    'i.warehouse_type_id',
    'i.code',
    'i.name',
    'i.brand',
    'i.model',
    dbOrTrx.raw('ig.code as item_group_code'),
    dbOrTrx.raw('ig.name as item_group_name'),
    dbOrTrx.raw('ig.size_spec as size_spec'),
    dbOrTrx.raw('ig.size_unit_id as size_unit_id'),
    'i.unit_id',
    'i.active'
  ];
}

function itemQueryWithGroups(dbOrTrx) {
  return dbOrTrx('items as i').leftJoin({ ig: 'item_groups' }, function joinItemGroup() {
    this.on('ig.id', '=', 'i.item_group_id').andOn('ig.organization_id', '=', 'i.organization_id');
  });
}

export async function listItemsByOrganization(organizationId, { active, warehouseTypeId, warehouseTypeCode } = {}) {
  const query = itemQueryWithGroups(db)
    .where({ 'i.organization_id': organizationId })
    .orderBy([{ column: 'i.active', order: 'desc' }, { column: 'i.name', order: 'asc' }])
    .select(itemSelectColumns(db));

  if (typeof active === 'boolean') query.andWhere({ 'i.active': active });

  const parsedWarehouseTypeId = Number(warehouseTypeId);
  if (Number.isFinite(parsedWarehouseTypeId) && parsedWarehouseTypeId > 0) {
    query.andWhere({ 'i.warehouse_type_id': parsedWarehouseTypeId });
  }

  const warehouseTypeCodeText = typeof warehouseTypeCode === 'string' ? warehouseTypeCode.trim() : '';
  if (warehouseTypeCodeText) {
    query.whereIn(
      'i.warehouse_type_id',
      db('warehouse_types')
        .where({ organization_id: organizationId })
        .whereRaw('lower(code) = lower(?)', [warehouseTypeCodeText])
        .select(['id'])
    );
  }

  return query;
}

export async function getItemById(id) {
  return itemQueryWithGroups(db).where({ 'i.id': id }).first(itemSelectColumns(db));
}

export async function createItem(
  trx,
  { organizationId, itemGroupId, warehouseTypeId, code, name, brand, model, unitId, active }
) {
  const rows = await trx('items')
    .insert({
      organization_id: organizationId,
      item_group_id: itemGroupId,
      warehouse_type_id: warehouseTypeId,
      code,
      name,
      brand: brand ?? null,
      model: model ?? null,
      unit_id: unitId,
      active: active ?? true
    })
    .returning(['id']);

  const insertedId = rows[0]?.id ?? null;
  if (!insertedId) return null;
  return itemQueryWithGroups(trx).where({ 'i.id': insertedId }).first(itemSelectColumns(trx));
}

export async function updateItem(
  trx,
  { organizationId, itemId, itemGroupId, code, name, brand, model, unitId, active }
) {
  const patch = {
    code,
    name,
    brand: brand ?? null,
    model: model ?? null,
    unit_id: unitId,
    active,
    updated_at: trx.fn.now()
  };
  if (itemGroupId != null) {
    patch.item_group_id = itemGroupId;
  }

  const rows = await trx('items')
    .where({ id: itemId, organization_id: organizationId })
    .update(patch)
    .returning(['id']);

  const updatedId = rows[0]?.id ?? null;
  if (!updatedId) return null;
  return itemQueryWithGroups(trx).where({ 'i.id': updatedId }).first(itemSelectColumns(trx));
}

export async function setItemActive(trx, { organizationId, itemId, active }) {
  const existing = await trx('items').where({ id: itemId, organization_id: organizationId }).first(['id', 'item_group_id']);
  if (!existing) return null;

  const rows = await trx('items')
    .where({ id: itemId, organization_id: organizationId })
    .update({ active, updated_at: trx.fn.now() })
    .returning(['id']);

  const updated = rows[0] ?? null;
  if (!updated) return null;

  await trx('item_groups')
    .where({ id: existing.item_group_id, organization_id: organizationId })
    .update({ active, updated_at: trx.fn.now() });

  return updated;
}
