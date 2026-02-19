/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasUnits = await knex.schema.hasTable('units');
  const hasTranslations = await knex.schema.hasTable('translations');
  if (!hasUnits || !hasTranslations) return;

  const rows = await knex('units').select(['organization_id', 'code', 'symbol']);

  for (const row of rows) {
    const code = String(row.code ?? '').toLowerCase();
    const symbol = row.symbol ? String(row.symbol) : '';

    if (!code || !symbol || code === 'piece') continue;

    const trSymbol = code === 'l' ? 'lt' : symbol;
    const enSymbol = symbol;

    await knex('translations')
      .insert({
        organization_id: row.organization_id,
        namespace: 'unit_symbol',
        entry_key: code,
        tr: trSymbol,
        en: enSymbol
      })
      .onConflict(['organization_id', 'namespace', 'entry_key'])
      .merge({ tr: trSymbol, en: enSymbol, updated_at: knex.fn.now() });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasTranslations = await knex.schema.hasTable('translations');
  if (!hasTranslations) return;

  await knex('translations').where({ namespace: 'unit_symbol' }).del();
};
