/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_plans');
  if (hasTable) return;

  await knex.schema.createTable('maintenance_plans', (t) => {
    t.increments('id').primary();
    t.integer('organization_id').notNullable().references('organizations.id').onDelete('CASCADE');
    t.integer('asset_id').notNullable().references('assets.id').onDelete('CASCADE');
    t.string('plan_type', 16).notNullable().defaultTo('RUNTIME');
    t.string('title', 255).notNullable();
    t.text('note').nullable();
    t.string('priority', 16).notNullable().defaultTo('MEDIUM');
    t.decimal('runtime_interval', 14, 3).notNullable();
    t.string('runtime_unit', 16).notNullable().defaultTo('HOUR');
    t.decimal('next_due_runtime', 14, 3).notNullable();
    t.integer('assigned_firm_id').nullable().references('firms.id').onDelete('SET NULL');
    t.specificType('assigned_employee_ids', 'integer[]').notNullable().defaultTo(knex.raw(`'{}'::int[]`));
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('last_triggered_at', { useTz: true }).nullable();
    t.integer('created_by_user_id').nullable().references('users.id').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    alter table maintenance_plans add constraint maintenance_plans_plan_type_check check (plan_type in ('RUNTIME'));
    alter table maintenance_plans add constraint maintenance_plans_priority_check check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
    alter table maintenance_plans add constraint maintenance_plans_runtime_unit_check check (runtime_unit in ('HOUR', 'KM'));
    alter table maintenance_plans add constraint maintenance_plans_runtime_interval_check check (runtime_interval > 0);
    alter table maintenance_plans add constraint maintenance_plans_next_due_runtime_check check (next_due_runtime >= 0);
    create index maintenance_plans_org_active_next_due_idx on maintenance_plans (organization_id, active, next_due_runtime);
    create index maintenance_plans_org_asset_active_idx on maintenance_plans (organization_id, asset_id, active);
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_plans');
  if (!hasTable) return;

  await knex.schema.dropTable('maintenance_plans');
};
