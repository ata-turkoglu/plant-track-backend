/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_plans');
  if (!hasTable) return;

  await knex.raw(`
    drop index if exists maintenance_plans_org_active_next_due_idx;
    alter table maintenance_plans drop constraint if exists maintenance_plans_plan_type_check;
    alter table maintenance_plans drop constraint if exists maintenance_plans_runtime_unit_check;
    alter table maintenance_plans drop constraint if exists maintenance_plans_runtime_interval_check;
    alter table maintenance_plans drop constraint if exists maintenance_plans_next_due_runtime_check;
  `);

  const hasFirstPlannedAt = await knex.schema.hasColumn('maintenance_plans', 'first_planned_at');
  if (!hasFirstPlannedAt) {
    await knex.schema.alterTable('maintenance_plans', (t) => {
      t.timestamp('first_planned_at', { useTz: true }).nullable();
      t.integer('interval_days').nullable();
      t.timestamp('next_due_at', { useTz: true }).nullable();
      t.integer('occurrence_limit').nullable();
      t.integer('generated_count').notNullable().defaultTo(0);
    });
  }

  await knex.schema.alterTable('maintenance_plans', (t) => {
    t.decimal('runtime_interval', 14, 3).nullable().alter();
    t.string('runtime_unit', 16).nullable().alter();
    t.decimal('next_due_runtime', 14, 3).nullable().alter();
  });

  await knex.raw(`
    update maintenance_plans
    set generated_count = coalesce(generated_count, 0)
    where generated_count is null;

    alter table maintenance_plans
      add constraint maintenance_plans_plan_type_check
      check (plan_type in ('RUNTIME', 'TIME'));

    alter table maintenance_plans
      add constraint maintenance_plans_runtime_unit_check
      check (runtime_unit is null or runtime_unit in ('HOUR', 'KM'));

    alter table maintenance_plans
      add constraint maintenance_plans_runtime_interval_check
      check (runtime_interval is null or runtime_interval > 0);

    alter table maintenance_plans
      add constraint maintenance_plans_next_due_runtime_check
      check (next_due_runtime is null or next_due_runtime >= 0);

    alter table maintenance_plans
      add constraint maintenance_plans_interval_days_check
      check (interval_days is null or interval_days > 0);

    alter table maintenance_plans
      add constraint maintenance_plans_occurrence_limit_check
      check (occurrence_limit is null or occurrence_limit > 0);

    alter table maintenance_plans
      add constraint maintenance_plans_generated_count_check
      check (generated_count >= 0);

    alter table maintenance_plans
      add constraint maintenance_plans_occurrence_progress_check
      check (occurrence_limit is null or generated_count <= occurrence_limit);

    alter table maintenance_plans
      add constraint maintenance_plans_type_fields_check
      check (
        (plan_type = 'RUNTIME'
          and runtime_interval is not null
          and runtime_unit is not null
          and next_due_runtime is not null
          and first_planned_at is null
          and interval_days is null
          and next_due_at is null
          and occurrence_limit is null
          and generated_count = 0)
        or
        (plan_type = 'TIME'
          and runtime_interval is null
          and runtime_unit is null
          and next_due_runtime is null
          and first_planned_at is not null
          and interval_days is not null
          and occurrence_limit is not null
          and next_due_at is not null)
      );

    create index maintenance_plans_org_active_runtime_due_idx
      on maintenance_plans (organization_id, active, next_due_runtime)
      where plan_type = 'RUNTIME';

    create index maintenance_plans_org_active_time_due_idx
      on maintenance_plans (organization_id, active, next_due_at)
      where plan_type = 'TIME';
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_plans');
  if (!hasTable) return;

  await knex.raw(`
    drop index if exists maintenance_plans_org_active_runtime_due_idx;
    drop index if exists maintenance_plans_org_active_time_due_idx;
    alter table maintenance_plans drop constraint if exists maintenance_plans_type_fields_check;
    alter table maintenance_plans drop constraint if exists maintenance_plans_occurrence_progress_check;
    alter table maintenance_plans drop constraint if exists maintenance_plans_generated_count_check;
    alter table maintenance_plans drop constraint if exists maintenance_plans_occurrence_limit_check;
    alter table maintenance_plans drop constraint if exists maintenance_plans_interval_days_check;
    alter table maintenance_plans drop constraint if exists maintenance_plans_next_due_runtime_check;
    alter table maintenance_plans drop constraint if exists maintenance_plans_runtime_interval_check;
    alter table maintenance_plans drop constraint if exists maintenance_plans_runtime_unit_check;
    alter table maintenance_plans drop constraint if exists maintenance_plans_plan_type_check;
  `);

  const hasGeneratedCount = await knex.schema.hasColumn('maintenance_plans', 'generated_count');
  if (hasGeneratedCount) {
    await knex.schema.alterTable('maintenance_plans', (t) => {
      t.dropColumn('generated_count');
      t.dropColumn('occurrence_limit');
      t.dropColumn('next_due_at');
      t.dropColumn('interval_days');
      t.dropColumn('first_planned_at');
    });
  }

  await knex.raw(`
    update maintenance_plans
    set plan_type = 'RUNTIME'
    where plan_type <> 'RUNTIME';

    update maintenance_plans
    set runtime_interval = coalesce(runtime_interval, 1),
        runtime_unit = coalesce(runtime_unit, 'HOUR'),
        next_due_runtime = coalesce(next_due_runtime, 0)
    where runtime_interval is null
       or runtime_unit is null
       or next_due_runtime is null;
  `);

  await knex.schema.alterTable('maintenance_plans', (t) => {
    t.decimal('runtime_interval', 14, 3).notNullable().alter();
    t.string('runtime_unit', 16).notNullable().alter();
    t.decimal('next_due_runtime', 14, 3).notNullable().alter();
  });

  await knex.raw(`
    alter table maintenance_plans
      add constraint maintenance_plans_plan_type_check
      check (plan_type in ('RUNTIME'));

    alter table maintenance_plans
      add constraint maintenance_plans_runtime_unit_check
      check (runtime_unit in ('HOUR', 'KM'));

    alter table maintenance_plans
      add constraint maintenance_plans_runtime_interval_check
      check (runtime_interval > 0);

    alter table maintenance_plans
      add constraint maintenance_plans_next_due_runtime_check
      check (next_due_runtime >= 0);

    create index maintenance_plans_org_active_next_due_idx
      on maintenance_plans (organization_id, active, next_due_runtime);
  `);
};
