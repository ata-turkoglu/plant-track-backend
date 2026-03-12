/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasAssets = await knex.schema.hasTable('assets');
  if (!hasAssets) return;

  const hasRuntimeMeterValue = await knex.schema.hasColumn('assets', 'runtime_meter_value');
  const hasRuntimeMeterUnit = await knex.schema.hasColumn('assets', 'runtime_meter_unit');
  const hasRuntimeHours = await knex.schema.hasColumn('assets', 'runtime_hours');
  const hasRuntimeSeconds = await knex.schema.hasColumn('assets', 'runtime_seconds');
  const hasRunningSince = await knex.schema.hasColumn('assets', 'running_since');

  if (!hasRuntimeMeterValue) {
    await knex.schema.alterTable('assets', (t) => {
      t.decimal('runtime_meter_value', 14, 3).notNullable().defaultTo(0);
    });
  }

  if (!hasRuntimeMeterUnit) {
    await knex.schema.alterTable('assets', (t) => {
      t.string('runtime_meter_unit', 16).notNullable().defaultTo('HOUR');
    });
  }

  if (hasRuntimeHours) {
    await knex.raw(`
      update assets
      set runtime_meter_value = coalesce(runtime_hours, 0)::numeric
    `);
  } else if (hasRuntimeSeconds) {
    await knex.raw(`
      update assets
      set runtime_meter_value = coalesce(runtime_seconds, 0)::numeric / 3600.0
    `);
  }

  if (hasRuntimeHours) {
    await knex.schema.alterTable('assets', (t) => {
      t.dropColumn('runtime_hours');
    });
  }

  if (hasRuntimeSeconds) {
    await knex.schema.alterTable('assets', (t) => {
      t.dropColumn('runtime_seconds');
    });
  }

  if (hasRunningSince) {
    await knex.schema.alterTable('assets', (t) => {
      t.dropColumn('running_since');
    });
  }

  await knex.raw(`
    alter table assets drop constraint if exists assets_runtime_meter_unit_check;
    alter table assets add constraint assets_runtime_meter_unit_check check (runtime_meter_unit in ('HOUR', 'KM'))
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasAssets = await knex.schema.hasTable('assets');
  if (!hasAssets) return;

  const hasRuntimeMeterValue = await knex.schema.hasColumn('assets', 'runtime_meter_value');
  const hasRuntimeMeterUnit = await knex.schema.hasColumn('assets', 'runtime_meter_unit');
  const hasRuntimeSeconds = await knex.schema.hasColumn('assets', 'runtime_seconds');
  const hasRunningSince = await knex.schema.hasColumn('assets', 'running_since');

  if (!hasRuntimeSeconds) {
    await knex.schema.alterTable('assets', (t) => {
      t.bigInteger('runtime_seconds').notNullable().defaultTo(0);
    });
  }

  if (!hasRunningSince) {
    await knex.schema.alterTable('assets', (t) => {
      t.timestamp('running_since', { useTz: true }).nullable();
    });
  }

  if (hasRuntimeMeterValue) {
    await knex.raw(`
      update assets
      set runtime_seconds = round(coalesce(runtime_meter_value, 0)::numeric * 3600)
    `);
  }

  await knex.raw('alter table assets drop constraint if exists assets_runtime_meter_unit_check');

  if (hasRuntimeMeterUnit) {
    await knex.schema.alterTable('assets', (t) => {
      t.dropColumn('runtime_meter_unit');
    });
  }

  if (hasRuntimeMeterValue) {
    await knex.schema.alterTable('assets', (t) => {
      t.dropColumn('runtime_meter_value');
    });
  }
};
