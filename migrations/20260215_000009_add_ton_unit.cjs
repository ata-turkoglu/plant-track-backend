/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const organizations = await knex('organizations').select(['id']);
  for (const org of organizations) {
    const existing = await knex('units').where({ organization_id: org.id, code: 'ton' }).first(['id']);
    if (existing) continue;
    await knex('units').insert({
      organization_id: org.id,
      code: 'ton',
      name: 'Ton',
      symbol: 't',
      system: true,
      active: true
    });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex('units').where({ code: 'ton', system: true }).del();
};

