/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  const hasUnits = await knex.schema.hasTable('units');
  if (!hasOrganizations || !hasUnits) return;

  const organizations = await knex('organizations').select(['id']);

  for (const org of organizations) {
    const payload = [
      { organization_id: org.id, code: 'micron', name: 'Micron', symbol: 'um', system: true, active: true },
      { organization_id: org.id, code: 'mesh', name: 'Mesh', symbol: 'mesh', system: true, active: true }
    ];

    for (const unit of payload) {
      const exists = await knex('units')
        .where({ organization_id: unit.organization_id })
        .whereRaw('lower(code) = lower(?)', [unit.code])
        .first(['id']);

      if (exists) continue;
      await knex('units').insert(unit);
    }
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasUnits = await knex.schema.hasTable('units');
  if (!hasUnits) return;

  await knex('units').whereIn('code', ['micron', 'mesh']).andWhere({ system: true }).del();
};
