/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasAssets = await knex.schema.hasTable('assets');
  const hasAssetsRuntimeMeterUnit = hasAssets ? await knex.schema.hasColumn('assets', 'runtime_meter_unit') : false;
  const hasAssetsAssetCardId = hasAssets ? await knex.schema.hasColumn('assets', 'asset_card_id') : false;

  async function ensureRuntimeMeterUnitOnTable(tableName) {
    const hasTable = await knex.schema.hasTable(tableName);
    if (!hasTable) return;

    const hasRuntimeMeterUnit = await knex.schema.hasColumn(tableName, 'runtime_meter_unit');
    if (!hasRuntimeMeterUnit) {
      await knex.schema.alterTable(tableName, (t) => {
        t.string('runtime_meter_unit', 16).notNullable().defaultTo('HOUR');
      });
    }

    await knex.raw('alter table ?? drop constraint if exists ??', [tableName, `${tableName}_runtime_meter_unit_check`]);
    await knex.raw("alter table ?? add constraint ?? check (runtime_meter_unit in ('HOUR', 'KM'))", [
      tableName,
      `${tableName}_runtime_meter_unit_check`
    ]);
  }

  await ensureRuntimeMeterUnitOnTable('asset_cards');
  await ensureRuntimeMeterUnitOnTable('asset_types');

  const hasAssetCards = await knex.schema.hasTable('asset_cards');
  const hasAssetCardsRuntimeUnit = hasAssetCards ? await knex.schema.hasColumn('asset_cards', 'runtime_meter_unit') : false;
  if (hasAssets && hasAssetsRuntimeMeterUnit && hasAssetsAssetCardId && hasAssetCards && hasAssetCardsRuntimeUnit) {
    await knex.raw(`
      update asset_cards ac
      set runtime_meter_unit = source.runtime_meter_unit
      from (
        select
          asset_card_id,
          case
            when count(distinct runtime_meter_unit) = 1 then max(runtime_meter_unit)
            else 'HOUR'
          end as runtime_meter_unit
        from assets
        where asset_card_id is not null and runtime_meter_unit in ('HOUR', 'KM')
        group by asset_card_id
      ) source
      where ac.id = source.asset_card_id
    `);
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  async function dropRuntimeMeterUnitFromTable(tableName) {
    const hasTable = await knex.schema.hasTable(tableName);
    if (!hasTable) return;

    await knex.raw('alter table ?? drop constraint if exists ??', [tableName, `${tableName}_runtime_meter_unit_check`]);

    const hasRuntimeMeterUnit = await knex.schema.hasColumn(tableName, 'runtime_meter_unit');
    if (hasRuntimeMeterUnit) {
      await knex.schema.alterTable(tableName, (t) => {
        t.dropColumn('runtime_meter_unit');
      });
    }
  }

  await dropRuntimeMeterUnitFromTable('asset_cards');
  await dropRuntimeMeterUnitFromTable('asset_types');
};
