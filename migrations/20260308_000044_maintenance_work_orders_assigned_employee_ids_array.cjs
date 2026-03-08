/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_work_orders');
  if (!hasTable) return;

  const hasAssignedEmployeeIds = await knex.schema.hasColumn('maintenance_work_orders', 'assigned_employee_ids');
  const hasAssignedEmployeeId = await knex.schema.hasColumn('maintenance_work_orders', 'assigned_employee_id');

  if (!hasAssignedEmployeeIds && hasAssignedEmployeeId) {
    await knex.raw('alter table maintenance_work_orders drop constraint if exists maintenance_work_orders_assigned_employee_id_foreign');
    await knex.schema.alterTable('maintenance_work_orders', (t) => {
      t.renameColumn('assigned_employee_id', 'assigned_employee_ids');
    });
  }

  const hasTargetColumn = await knex.schema.hasColumn('maintenance_work_orders', 'assigned_employee_ids');
  if (!hasTargetColumn) return;

  await knex.raw('alter table maintenance_work_orders drop constraint if exists maintenance_work_orders_assigned_employee_ids_foreign');

  const targetColumnInfo = await knex('information_schema.columns')
    .where({
      table_schema: 'public',
      table_name: 'maintenance_work_orders',
      column_name: 'assigned_employee_ids'
    })
    .first(['udt_name']);

  if (targetColumnInfo?.udt_name !== '_int4') {
    await knex.raw(`
      alter table maintenance_work_orders
      alter column assigned_employee_ids type integer[]
      using (
        case
          when assigned_employee_ids is null then '{}'::integer[]
          else array[assigned_employee_ids::integer]
        end
      )
    `);
  }

  await knex.raw("update maintenance_work_orders set assigned_employee_ids = '{}'::integer[] where assigned_employee_ids is null");
  await knex.raw("alter table maintenance_work_orders alter column assigned_employee_ids set default '{}'::integer[]");
  await knex.raw('alter table maintenance_work_orders alter column assigned_employee_ids set not null');

  await knex.raw('drop index if exists maintenance_work_orders_organization_id_assigned_employee_id_index');
  await knex.raw('drop index if exists maintenance_work_orders_organization_id_assigned_employee_ids_index');
  await knex.raw('drop index if exists mwo_org_assigned_employee_idx');
  await knex.raw('create index if not exists maintenance_work_orders_assigned_employee_ids_gin on maintenance_work_orders using gin (assigned_employee_ids)');
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_work_orders');
  if (!hasTable) return;

  const hasAssignedEmployeeIds = await knex.schema.hasColumn('maintenance_work_orders', 'assigned_employee_ids');
  if (!hasAssignedEmployeeIds) return;

  await knex.raw('drop index if exists maintenance_work_orders_assigned_employee_ids_gin');
  await knex.raw('alter table maintenance_work_orders alter column assigned_employee_ids drop default');
  await knex.raw('alter table maintenance_work_orders alter column assigned_employee_ids drop not null');

  const targetColumnInfo = await knex('information_schema.columns')
    .where({
      table_schema: 'public',
      table_name: 'maintenance_work_orders',
      column_name: 'assigned_employee_ids'
    })
    .first(['udt_name']);

  if (targetColumnInfo?.udt_name === '_int4') {
    await knex.raw(`
      alter table maintenance_work_orders
      alter column assigned_employee_ids type integer
      using (nullif((assigned_employee_ids)[1], null))
    `);
  }

  const hasAssignedEmployeeId = await knex.schema.hasColumn('maintenance_work_orders', 'assigned_employee_id');
  if (!hasAssignedEmployeeId) {
    await knex.schema.alterTable('maintenance_work_orders', (t) => {
      t.renameColumn('assigned_employee_ids', 'assigned_employee_id');
    });
  }

  await knex.raw('drop index if exists maintenance_work_orders_organization_id_assigned_employee_ids_index');
  await knex.raw('drop index if exists mwo_org_assigned_employee_idx');
  await knex.raw('create index if not exists maintenance_work_orders_organization_id_assigned_employee_id_index on maintenance_work_orders (organization_id, assigned_employee_id)');
  await knex.raw('alter table maintenance_work_orders drop constraint if exists maintenance_work_orders_assigned_employee_id_foreign');
  await knex.raw(`
    alter table maintenance_work_orders
    add constraint maintenance_work_orders_assigned_employee_id_foreign
    foreign key (assigned_employee_id) references employees(id) on delete set null
  `);
};
