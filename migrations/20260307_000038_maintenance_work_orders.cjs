/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasWorkOrders = await knex.schema.hasTable('maintenance_work_orders');
  if (!hasWorkOrders) {
    await knex.schema.createTable('maintenance_work_orders', (t) => {
      t.increments('id').primary();
      t.integer('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      t.integer('asset_id').notNullable().references('id').inTable('assets').onDelete('CASCADE');
      t.string('type', 16).notNullable();
      t.string('status', 16).notNullable().defaultTo('OPEN');
      t.string('priority', 16).notNullable().defaultTo('MEDIUM');
      t.string('title', 255).notNullable();
      t.text('symptom').nullable();
      t.text('note').nullable();
      t.text('root_cause').nullable();
      t.text('resolution_note').nullable();
      t.timestamp('planned_at', { useTz: true }).nullable();
      t.timestamp('opened_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp('started_at', { useTz: true }).nullable();
      t.timestamp('completed_at', { useTz: true }).nullable();
      t.integer('downtime_minutes').nullable();
      t.integer('assigned_firm_id').nullable().references('id').inTable('firms');
      t.integer('created_by_user_id').nullable().references('id').inTable('users');
      t.integer('closed_by_user_id').nullable().references('id').inTable('users');
      t.timestamps(true, true);

      t.index(['organization_id', 'asset_id'], 'mwo_org_asset_idx');
      t.index(['organization_id', 'asset_id', 'status'], 'mwo_org_asset_status_idx');
      t.index(['organization_id', 'opened_at'], 'mwo_org_opened_at_idx');
    });

    await knex.raw(
      "alter table maintenance_work_orders add constraint maintenance_work_orders_type_check check (type in ('CORRECTIVE','PREVENTIVE'))"
    );
    await knex.raw(
      "alter table maintenance_work_orders add constraint maintenance_work_orders_status_check check (status in ('OPEN','IN_PROGRESS','DONE','CANCELLED'))"
    );
    await knex.raw(
      "alter table maintenance_work_orders add constraint maintenance_work_orders_priority_check check (priority in ('LOW','MEDIUM','HIGH','CRITICAL'))"
    );
    await knex.raw(
      'alter table maintenance_work_orders add constraint maintenance_work_orders_downtime_check check (downtime_minutes is null or downtime_minutes >= 0)'
    );
  }

  const hasParts = await knex.schema.hasTable('maintenance_work_order_parts');
  if (!hasParts) {
    await knex.schema.createTable('maintenance_work_order_parts', (t) => {
      t.increments('id').primary();
      t.integer('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      t.integer('work_order_id').notNullable().references('id').inTable('maintenance_work_orders').onDelete('CASCADE');
      t.integer('inventory_item_id').notNullable().references('id').inTable('inventory_items');
      t.integer('amount_unit_id').notNullable().references('id').inTable('units');
      t.integer('source_node_id').notNullable().references('id').inTable('nodes');
      t.decimal('quantity', 18, 3).notNullable();
      t.text('note').nullable();
      t.integer('movement_event_id').nullable().references('id').inTable('inventory_movement_events').onDelete('SET NULL');
      t.timestamps(true, true);

      t.index(['organization_id', 'work_order_id'], 'mwop_org_work_order_idx');
      t.index(['movement_event_id'], 'mwop_movement_event_idx');
    });

    await knex.raw(
      'alter table maintenance_work_order_parts add constraint maintenance_work_order_parts_quantity_check check (quantity > 0)'
    );
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasParts = await knex.schema.hasTable('maintenance_work_order_parts');
  if (hasParts) {
    await knex.schema.dropTable('maintenance_work_order_parts');
  }

  const hasWorkOrders = await knex.schema.hasTable('maintenance_work_orders');
  if (hasWorkOrders) {
    await knex.schema.dropTable('maintenance_work_orders');
  }
};
