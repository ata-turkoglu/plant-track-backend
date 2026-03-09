import db from '../db/knex.js';

export async function listUnitConversionsByOrganization(organizationId) {
  return db({ uc: 'unit_conversions' })
    .innerJoin({ uf: 'units' }, 'uf.id', 'uc.from_unit_id')
    .innerJoin({ ut: 'units' }, 'ut.id', 'uc.to_unit_id')
    .where({ 'uc.organization_id': organizationId })
    .orderBy([
      { column: 'uf.code', order: 'asc' },
      { column: 'ut.code', order: 'asc' }
    ])
    .select([
      'uc.id',
      'uc.organization_id',
      'uc.from_unit_id',
      'uc.to_unit_id',
      'uc.factor',
      'uc.system',
      'uc.created_at',
      'uc.updated_at',
      db.raw('uf.code as from_unit_code'),
      db.raw('uf.name as from_unit_name'),
      db.raw('uf.symbol as from_unit_symbol'),
      db.raw('uf.dimension as from_unit_dimension'),
      db.raw('ut.code as to_unit_code'),
      db.raw('ut.name as to_unit_name'),
      db.raw('ut.symbol as to_unit_symbol'),
      db.raw('ut.dimension as to_unit_dimension')
    ]);
}

export async function getUnitConversionById(id) {
  return db('unit_conversions')
    .where({ id })
    .first(['id', 'organization_id', 'from_unit_id', 'to_unit_id', 'factor', 'system', 'created_at', 'updated_at']);
}

export async function createUnitConversion(trx, { organizationId, fromUnitId, toUnitId, factor }) {
  const rows = await trx('unit_conversions')
    .insert({
      organization_id: organizationId,
      from_unit_id: fromUnitId,
      to_unit_id: toUnitId,
      factor,
      system: false
    })
    .returning(['id', 'organization_id', 'from_unit_id', 'to_unit_id', 'factor', 'system', 'created_at', 'updated_at']);

  return rows[0];
}

export async function updateUnitConversion(trx, { id, organizationId, fromUnitId, toUnitId, factor }) {
  const rows = await trx('unit_conversions')
    .where({ id, organization_id: organizationId })
    .update({
      from_unit_id: fromUnitId,
      to_unit_id: toUnitId,
      factor,
      updated_at: trx.fn.now()
    })
    .returning(['id', 'organization_id', 'from_unit_id', 'to_unit_id', 'factor', 'system', 'created_at', 'updated_at']);

  return rows[0] ?? null;
}

export async function deleteUnitConversion(trx, { id, organizationId }) {
  const rows = await trx('unit_conversions').where({ id, organization_id: organizationId }).del().returning(['id']);
  return rows[0] ?? null;
}

export async function findResolvedUnitConversion({ organizationId, fromUnitId, toUnitId }) {
  return db({ uc: 'unit_conversions' })
    .where({ 'uc.organization_id': organizationId })
    .andWhere((qb) => {
      qb.where({ 'uc.from_unit_id': fromUnitId, 'uc.to_unit_id': toUnitId }).orWhere({
        'uc.from_unit_id': toUnitId,
        'uc.to_unit_id': fromUnitId
      });
    })
    .orderByRaw('case when uc.from_unit_id = ? and uc.to_unit_id = ? then 0 else 1 end', [fromUnitId, toUnitId])
    .select([
      'uc.id',
      'uc.from_unit_id',
      'uc.to_unit_id',
      'uc.factor',
      db.raw(
        'case when uc.from_unit_id = ? and uc.to_unit_id = ? then ? else ? end as mode',
        [fromUnitId, toUnitId, 'direct', 'inverse']
      )
    ])
    .first();
}
