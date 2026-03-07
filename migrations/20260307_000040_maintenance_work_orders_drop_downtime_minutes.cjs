/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_work_orders');
  if (!hasTable) return;

  await knex.raw(
    'alter table maintenance_work_orders drop constraint if exists maintenance_work_orders_downtime_check'
  );

  const hasDowntime = await knex.schema.hasColumn('maintenance_work_orders', 'downtime_minutes');
  if (!hasDowntime) return;

  await knex.schema.alterTable('maintenance_work_orders', (t) => {
    t.dropColumn('downtime_minutes');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_work_orders');
  if (!hasTable) return;

  const hasDowntime = await knex.schema.hasColumn('maintenance_work_orders', 'downtime_minutes');
  if (!hasDowntime) {
    await knex.schema.alterTable('maintenance_work_orders', (t) => {
      t.integer('downtime_minutes').nullable();
    });
  }

  await knex.raw(
    'alter table maintenance_work_orders drop constraint if exists maintenance_work_orders_downtime_check'
  );
  await knex.raw(
    'alter table maintenance_work_orders add constraint maintenance_work_orders_downtime_check check (downtime_minutes is null or downtime_minutes >= 0)'
  );
};
