/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasUnits = await knex.schema.hasTable('units');
  const hasTranslations = await knex.schema.hasTable('translations');
  if (!hasUnits || !hasTranslations) return;

  const units = await knex('units').select(['organization_id', 'code', 'symbol']);

  for (const unit of units) {
    const symbol = String(unit.symbol ?? '').trim();
    if (!symbol) continue;

    const oldKey = String(unit.code ?? '').trim().toLowerCase();
    const newKey = symbol.toLowerCase();
    if (!oldKey || !newKey || oldKey === newKey) continue;

    const oldRow = await knex('translations')
      .where({
        organization_id: unit.organization_id,
        namespace: 'unit_symbol',
        entry_key: oldKey
      })
      .first(['tr', 'en']);

    if (!oldRow) continue;

    await knex('translations')
      .insert({
        organization_id: unit.organization_id,
        namespace: 'unit_symbol',
        entry_key: newKey,
        tr: oldRow.tr,
        en: oldRow.en
      })
      .onConflict(['organization_id', 'namespace', 'entry_key'])
      .merge({ tr: oldRow.tr, en: oldRow.en, updated_at: knex.fn.now() });

    await knex('translations')
      .where({
        organization_id: unit.organization_id,
        namespace: 'unit_symbol',
        entry_key: oldKey
      })
      .del();
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasUnits = await knex.schema.hasTable('units');
  const hasTranslations = await knex.schema.hasTable('translations');
  if (!hasUnits || !hasTranslations) return;

  const units = await knex('units').select(['organization_id', 'code', 'symbol']);

  for (const unit of units) {
    const symbol = String(unit.symbol ?? '').trim();
    if (!symbol) continue;

    const newKey = symbol.toLowerCase();
    const oldKey = String(unit.code ?? '').trim().toLowerCase();
    if (!oldKey || !newKey || oldKey === newKey) continue;

    const newRow = await knex('translations')
      .where({
        organization_id: unit.organization_id,
        namespace: 'unit_symbol',
        entry_key: newKey
      })
      .first(['tr', 'en']);

    if (!newRow) continue;

    await knex('translations')
      .insert({
        organization_id: unit.organization_id,
        namespace: 'unit_symbol',
        entry_key: oldKey,
        tr: newRow.tr,
        en: newRow.en
      })
      .onConflict(['organization_id', 'namespace', 'entry_key'])
      .merge({ tr: newRow.tr, en: newRow.en, updated_at: knex.fn.now() });

    await knex('translations')
      .where({
        organization_id: unit.organization_id,
        namespace: 'unit_symbol',
        entry_key: newKey
      })
      .del();
  }
};
