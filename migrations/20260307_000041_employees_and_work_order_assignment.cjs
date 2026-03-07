/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasEmployees = await knex.schema.hasTable('employees');
  if (!hasEmployees) {
    await knex.schema.createTable('employees', (t) => {
      t.increments('id').primary();
      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      t.string('name', 255).notNullable();
      t.string('title', 255).nullable();
      t.string('email', 255).nullable();
      t.string('phone', 64).nullable();
      t.text('notes').nullable();
      t.timestamps(true, true);

      t.index(['organization_id'], 'employees_org_idx');
      t.index(['organization_id', 'name'], 'employees_org_name_idx');
    });

    await knex.raw(
      'create unique index employees_org_email_uq on employees (organization_id, lower(email)) where email is not null'
    );
    await knex.raw('create unique index employees_org_phone_uq on employees (organization_id, phone) where phone is not null');
  }

  const hasWorkOrders = await knex.schema.hasTable('maintenance_work_orders');
  if (!hasWorkOrders) return;

  const hasAssignedEmployee = await knex.schema.hasColumn('maintenance_work_orders', 'assigned_employee_id');
  if (!hasAssignedEmployee) {
    await knex.schema.alterTable('maintenance_work_orders', (t) => {
      t.integer('assigned_employee_id').nullable().references('id').inTable('employees');
    });
  }

  await knex.raw(
    'create index if not exists mwo_org_assigned_employee_idx on maintenance_work_orders (organization_id, assigned_employee_id)'
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasWorkOrders = await knex.schema.hasTable('maintenance_work_orders');
  if (hasWorkOrders) {
    await knex.raw('drop index if exists mwo_org_assigned_employee_idx');

    const hasAssignedEmployee = await knex.schema.hasColumn('maintenance_work_orders', 'assigned_employee_id');
    if (hasAssignedEmployee) {
      await knex.schema.alterTable('maintenance_work_orders', (t) => {
        t.dropColumn('assigned_employee_id');
      });
    }
  }

  const hasEmployees = await knex.schema.hasTable('employees');
  if (!hasEmployees) return;

  await knex.raw('drop index if exists employees_org_email_uq');
  await knex.raw('drop index if exists employees_org_phone_uq');
  await knex.schema.dropTable('employees');
};
