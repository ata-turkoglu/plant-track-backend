/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('warehouses', (t) => {
    t.string('type', 32).notNullable().defaultTo('RAW_MATERIAL');
  });

  // Enforce allowed values without requiring a PG enum.
  await knex.raw(
    "alter table warehouses add constraint warehouses_type_check check (type in ('RAW_MATERIAL','SPARE_PART','FINISHED_GOOD'))"
  );

  // Backfill existing rows explicitly (in case default didn't apply)
  await knex('warehouses').whereNull('type').update({ type: 'RAW_MATERIAL' });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('alter table warehouses drop constraint if exists warehouses_type_check');
  await knex.schema.alterTable('warehouses', (t) => {
    t.dropColumn('type');
  });
};
