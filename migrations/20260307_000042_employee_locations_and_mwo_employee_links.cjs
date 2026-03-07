/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasEmployees = await knex.schema.hasTable('employees');
  if (hasEmployees) {
    const hasLocationId = await knex.schema.hasColumn('employees', 'location_id');
    if (!hasLocationId) {
      await knex.schema.alterTable('employees', (t) => {
        t.integer('location_id').nullable().references('id').inTable('locations');
      });
      await knex.raw('create index if not exists employees_org_location_idx on employees (organization_id, location_id)');
    }
  }

  const hasMwo = await knex.schema.hasTable('maintenance_work_orders');
  if (!hasMwo || !hasEmployees) return;

  const hasMwoEmployees = await knex.schema.hasTable('maintenance_work_order_employees');
  if (!hasMwoEmployees) {
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

  const hasAssignedEmployee = await knex.schema.hasColumn('maintenance_work_orders', 'assigned_employee_id');
  if (!hasAssignedEmployee) return;

  await knex.raw(`
    insert into maintenance_work_order_employees (organization_id, work_order_id, employee_id, created_at, updated_at)
    select mwo.organization_id, mwo.id, mwo.assigned_employee_id, now(), now()
    from maintenance_work_orders mwo
    where mwo.assigned_employee_id is not null
    on conflict (work_order_id, employee_id) do nothing
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasMwoEmployees = await knex.schema.hasTable('maintenance_work_order_employees');
  if (hasMwoEmployees) {
    await knex.schema.dropTable('maintenance_work_order_employees');
  }

  const hasEmployees = await knex.schema.hasTable('employees');
  if (!hasEmployees) return;

  await knex.raw('drop index if exists employees_org_location_idx');
  const hasLocationId = await knex.schema.hasColumn('employees', 'location_id');
  if (hasLocationId) {
    await knex.schema.alterTable('employees', (t) => {
      t.dropColumn('location_id');
    });
  }
};
