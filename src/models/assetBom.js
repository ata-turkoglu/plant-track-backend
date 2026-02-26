import db from '../db/knex.js';

export async function listAssetBomLines(organizationId, assetId) {
  return db('asset_bom_lines as abl')
    .where({ 'abl.organization_id': organizationId, 'abl.asset_id': assetId })
    .join('item_groups as ig', 'abl.item_group_id', 'ig.id')
    .join('units as u', 'abl.unit_id', 'u.id')
    .leftJoin({ su: 'units' }, 'ig.size_unit_id', 'su.id')
    .select([
      'abl.id',
      'abl.organization_id',
      'abl.asset_id',
      'abl.item_group_id',
      'abl.unit_id',
      'abl.quantity',
      'abl.note',
      'abl.meta_json',
      'abl.created_at',
      'abl.updated_at',
      'ig.code as item_group_code',
      'ig.name as item_group_name',
      'ig.size_spec as item_group_size_spec',
      'ig.size_unit_id as item_group_size_unit_id',
      'su.code as item_group_size_unit_code',
      'su.name as item_group_size_unit_name',
      'su.symbol as item_group_size_unit_symbol',
      'u.code as unit_code',
      'u.name as unit_name',
      'u.symbol as unit_symbol'
    ])
    .orderBy([{ column: 'ig.name', order: 'asc' }, { column: 'abl.id', order: 'asc' }]);
}

export async function createAssetBomLine(trx, { organizationId, assetId, itemGroupId, unitId, quantity, note, metaJson }) {
  const rows = await trx('asset_bom_lines')
    .insert({
      organization_id: organizationId,
      asset_id: assetId,
      item_group_id: itemGroupId,
      unit_id: unitId,
      quantity,
      note: note ?? null,
      meta_json: metaJson ?? null
    })
    .returning([
      'id',
      'organization_id',
      'asset_id',
      'item_group_id',
      'unit_id',
      'quantity',
      'note',
      'meta_json',
      'created_at',
      'updated_at'
    ]);
  return rows[0];
}

export async function updateAssetBomLine(trx, { organizationId, assetId, lineId, quantity, note, metaJson }) {
  const rows = await trx('asset_bom_lines')
    .where({ id: lineId, organization_id: organizationId, asset_id: assetId })
    .update({
      quantity,
      note: note ?? null,
      meta_json: metaJson ?? null,
      updated_at: trx.fn.now()
    })
    .returning([
      'id',
      'organization_id',
      'asset_id',
      'item_group_id',
      'unit_id',
      'quantity',
      'note',
      'meta_json',
      'created_at',
      'updated_at'
    ]);
  return rows[0] ?? null;
}

export async function deleteAssetBomLine(trx, { organizationId, assetId, lineId }) {
  const rows = await trx('asset_bom_lines')
    .where({ id: lineId, organization_id: organizationId, asset_id: assetId })
    .del()
    .returning(['id']);
  return rows[0] ?? null;
}

export async function getAssetBomRollup(organizationId, rootAssetId) {
  // Aggregates required quantities across an asset subtree.
  return db.raw(
    `
    with recursive asset_tree as (
      select a.id
      from assets a
      where a.organization_id = ?
        and a.id = ?
      union all
      select child.id
      from assets child
      join asset_tree t on child.parent_asset_id = t.id
      where child.organization_id = ?
    )
    select
      abl.item_group_id,
      abl.unit_id,
      sum(abl.quantity)::numeric(18,3) as required_quantity,
      ig.code as item_group_code,
      ig.name as item_group_name,
      ig.size_spec as item_group_size_spec,
      ig.size_unit_id as item_group_size_unit_id,
      su.code as item_group_size_unit_code,
      su.name as item_group_size_unit_name,
      su.symbol as item_group_size_unit_symbol,
      u.code as unit_code,
      u.name as unit_name,
      u.symbol as unit_symbol
    from asset_bom_lines abl
    join asset_tree t on t.id = abl.asset_id
    join item_groups ig on ig.id = abl.item_group_id
    join units u on u.id = abl.unit_id
    left join units su on su.id = ig.size_unit_id
    where abl.organization_id = ?
    group by
      abl.item_group_id,
      abl.unit_id,
      ig.code,
      ig.name,
      ig.size_spec,
      ig.size_unit_id,
      su.code,
      su.name,
      su.symbol,
      u.code,
      u.name,
      u.symbol
    order by ig.name asc
    `,
    [organizationId, rootAssetId, organizationId, organizationId]
  );
}
