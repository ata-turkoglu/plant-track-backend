/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_work_order_employees');
  if (!hasTable) return;

  await knex.schema.dropTable('maintenance_work_order_employees');
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  const hasEmployees = await knex.schema.hasTable('employees');
  const hasWorkOrders = await knex.schema.hasTable('maintenance_work_orders');
  if (!hasOrganizations || !hasEmployees || !hasWorkOrders) return;

  const hasTable = await knex.schema.hasTable('maintenance_work_order_employees');
  if (!hasTable) {
    await knex.schema.createTable('maintenance_work_order_employees', (t) => {
      t.increments('id').primary();
      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      t
        .integer('work_order_id')
        .notNullable()
        .references('id')
        .inTable('maintenance_work_orders')
        .onDelete('CASCADE');
      t
        .integer('employee_id')
        .notNullable()
        .references('id')
        .inTable('employees');
      t.timestamps(true, true);

      t.unique(['work_order_id', 'employee_id'], 'mwo_employees_work_order_employee_uq');
      t.index(['organization_id', 'work_order_id'], 'mwo_employees_org_work_order_idx');
      t.index(['organization_id', 'employee_id'], 'mwo_employees_org_employee_idx');
    });
  }

  const hasAssignedEmployeeIds = await knex.schema.hasColumn('maintenance_work_orders', 'assigned_employee_ids');
  if (hasAssignedEmployeeIds) {
    await knex.raw(`
      insert into maintenance_work_order_employees (organization_id, work_order_id, employee_id, created_at, updated_at)
      select mwo.organization_id, mwo.id, employee_id, now(), now()
      from maintenance_work_orders mwo
      cross join lateral unnest(coalesce(mwo.assigned_employee_ids, '{}'::int[])) as employee_id
      on conflict (work_order_id, employee_id) do nothing
    `);
    return;
  }

  const hasAssignedEmployeeId = await knex.schema.hasColumn('maintenance_work_orders', 'assigned_employee_id');
  if (!hasAssignedEmployeeId) return;

  await knex.raw(`
    insert into maintenance_work_order_employees (organization_id, work_order_id, employee_id, created_at, updated_at)
    select mwo.organization_id, mwo.id, mwo.assigned_employee_id, now(), now()
    from maintenance_work_orders mwo
    where mwo.assigned_employee_id is not null
    on conflict (work_order_id, employee_id) do nothing
  `);
};
