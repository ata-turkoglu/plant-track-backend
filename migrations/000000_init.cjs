/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // Core
  await knex.schema.createTable('organizations', (t) => {
    t.increments('id').primary();
    t.string('name', 255).notNullable();
    t.string('code', 64).nullable().unique();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t.string('name', 255).notNullable();
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('role', 32).notNullable().defaultTo('admin');

    t.timestamps(true, true);

    t.index(['organization_id']);
  });

  // Locations / Warehouses
  await knex.schema.createTable('locations', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t.integer('parent_id').nullable().references('id').inTable('locations');
    t.string('name', 255).notNullable();

    t.timestamps(true, true);

    t.index(['organization_id']);
    t.index(['parent_id']);
    t.index(['organization_id', 'parent_id']);
  });

  await knex.schema.createTable('warehouse_types', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t.string('code', 64).notNullable();
    t.string('name', 255).notNullable();
    t.text('description').nullable();
    t.boolean('system').notNullable().defaultTo(true);

    t.timestamps(true, true);

    t.unique(['organization_id', 'code']);
    t.index(['organization_id']);
  });

  await knex.schema.createTable('warehouses', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t.integer('location_id').notNullable().references('id').inTable('locations');
    t.integer('warehouse_type_id').notNullable().references('id').inTable('warehouse_types');

    t.string('name', 255).notNullable();

    t.timestamps(true, true);

    t.index(['organization_id']);
    t.index(['location_id']);
    t.index(['organization_id', 'location_id']);
    t.index(['warehouse_type_id']);
  });

  // Units / Items
  await knex.schema.createTable('units', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t.string('code', 16).notNullable();
    t.string('name', 64).notNullable();
    t.string('symbol', 16).nullable();
    t.boolean('system').notNullable().defaultTo(true);
    t.boolean('active').notNullable().defaultTo(true);

    t.timestamps(true, true);

    t.unique(['organization_id', 'code']);
    t.index(['organization_id']);
    t.index(['organization_id', 'active']);
  });

  await knex.schema.createTable('items', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // Kept for backward compatibility: derived from warehouse_types.code.
    t.string('type', 32).notNullable();
    t.string('code', 64).notNullable();
    t.string('name', 255).notNullable();
    t.boolean('active').notNullable().defaultTo(true);

    t.integer('unit_id').notNullable().references('id').inTable('units');
    t.integer('warehouse_type_id').notNullable().references('id').inTable('warehouse_types');

    t.timestamps(true, true);

    t.unique(['organization_id', 'code']);
    t.index(['organization_id']);
    t.index(['organization_id', 'type']);
    t.index(['unit_id']);
    t.index(['organization_id', 'warehouse_type_id']);
  });

  // Business entities
  await knex.schema.createTable('suppliers', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // SUPPLIER_EXTERNAL / SUPPLIER_INTERNAL
    t.string('kind', 32).notNullable();
    t.string('name', 255).notNullable();
    t.boolean('active').notNullable().defaultTo(true);

    t.string('email', 255).nullable();
    t.string('phone', 64).nullable();
    t.text('address').nullable();
    t.string('tax_no', 64).nullable();
    t.string('contact_name', 255).nullable();
    t.text('notes').nullable();

    t.timestamps(true, true);

    t.unique(['organization_id', 'kind', 'name']);
    t.index(['organization_id']);
    t.index(['organization_id', 'kind']);
    t.index(['organization_id', 'active']);
  });

  await knex.schema.createTable('customers', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t.string('name', 255).notNullable();
    t.boolean('active').notNullable().defaultTo(true);

    t.string('email', 255).nullable();
    t.string('phone', 64).nullable();
    t.text('address').nullable();
    t.string('tax_no', 64).nullable();
    t.string('contact_name', 255).nullable();
    t.text('notes').nullable();

    t.timestamps(true, true);

    t.unique(['organization_id', 'name']);
    t.index(['organization_id']);
    t.index(['organization_id', 'active']);
  });

  await knex.schema.createTable('machines', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t.string('name', 255).notNullable();
    t.boolean('active').notNullable().defaultTo(true);

    t.timestamps(true, true);

    t.unique(['organization_id', 'name']);
    t.index(['organization_id']);
    t.index(['organization_id', 'active']);
  });

  await knex.raw(
    "alter table suppliers add constraint suppliers_kind_check check (kind in ('SUPPLIER_EXTERNAL','SUPPLIER_INTERNAL'))"
  );

  await knex.raw(
    'create unique index suppliers_org_email_uq on suppliers (organization_id, lower(email)) where email is not null'
  );
  await knex.raw('create unique index suppliers_org_phone_uq on suppliers (organization_id, phone) where phone is not null');
  await knex.raw(
    'create unique index customers_org_email_uq on customers (organization_id, lower(email)) where email is not null'
  );
  await knex.raw('create unique index customers_org_phone_uq on customers (organization_id, phone) where phone is not null');

  // Nodes (stock endpoints)
  await knex.schema.createTable('nodes', (t) => {
    t.increments('id').primary();
    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    t.string('node_type', 32).notNullable();
    t.string('ref_table', 64).notNullable();
    t.string('ref_id', 64).notNullable();
    t.string('code', 64).nullable();
    t.string('name', 255).notNullable();
    t.boolean('is_stocked').notNullable().defaultTo(true);
    t.jsonb('meta_json').nullable();
    t.timestamps(true, true);

    t.unique(['organization_id', 'node_type', 'ref_table', 'ref_id']);
    t.index(['organization_id', 'node_type']);
    t.index(['ref_table', 'ref_id']);
  });

  await knex.raw(
    "alter table nodes add constraint nodes_node_type_check check (node_type in ('WAREHOUSE','LOCATION','SUPPLIER','CUSTOMER','ASSET','VIRTUAL'))"
  );

  // Inventory movement ledger (header + lines)
  await knex.schema.createTable('inventory_movement_events', (t) => {
    t.increments('id').primary();
    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    t.string('event_type', 32).notNullable();
    t.string('status', 16).notNullable().defaultTo('POSTED');
    t.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.string('reference_type', 64).nullable();
    t.string('reference_id', 64).nullable();
    t.text('note').nullable();
    t.integer('created_by_user_id').nullable().references('id').inTable('users');
    t.timestamps(true, true);

    t.index(['organization_id', 'occurred_at']);
    t.index(['event_type', 'occurred_at']);
  });

  await knex.raw(
    `alter table inventory_movement_events
       add constraint inventory_movement_events_status_check check (status in ('DRAFT','POSTED','CANCELLED'))`
  );

  await knex.schema.createTable('inventory_movement_lines', (t) => {
    t.increments('id').primary();
    t
      .integer('event_id')
      .notNullable()
      .references('id')
      .inTable('inventory_movement_events')
      .onDelete('CASCADE');
    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    t.integer('line_no').notNullable().defaultTo(1);
    t.integer('item_id').notNullable().references('id').inTable('items');
    t.integer('unit_id').notNullable().references('id').inTable('units');
    t.integer('from_node_id').notNullable().references('id').inTable('nodes');
    t.integer('to_node_id').notNullable().references('id').inTable('nodes');
    t.decimal('quantity', 18, 3).notNullable();
    t.timestamps(true, true);

    t.unique(['event_id', 'line_no']);
    t.index(['to_node_id', 'item_id']);
    t.index(['from_node_id', 'item_id']);
    t.index(['event_id']);
    t.index(['organization_id', 'item_id']);
  });

  await knex.raw(
    `alter table inventory_movement_lines
       add constraint inventory_movement_lines_qty_check check (quantity > 0)`
  );
  await knex.raw(
    `alter table inventory_movement_lines
       add constraint inventory_movement_lines_from_to_check check (from_node_id <> to_node_id)`
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('alter table inventory_movement_lines drop constraint if exists inventory_movement_lines_from_to_check');
  await knex.raw('alter table inventory_movement_lines drop constraint if exists inventory_movement_lines_qty_check');
  await knex.raw('alter table inventory_movement_events drop constraint if exists inventory_movement_events_status_check');
  await knex.raw('alter table nodes drop constraint if exists nodes_node_type_check');
  await knex.raw('alter table suppliers drop constraint if exists suppliers_kind_check');

  await knex.raw('drop index if exists customers_org_phone_uq');
  await knex.raw('drop index if exists customers_org_email_uq');
  await knex.raw('drop index if exists suppliers_org_phone_uq');
  await knex.raw('drop index if exists suppliers_org_email_uq');

  await knex.schema.dropTableIfExists('inventory_movement_lines');
  await knex.schema.dropTableIfExists('inventory_movement_events');
  await knex.schema.dropTableIfExists('nodes');
  await knex.schema.dropTableIfExists('machines');
  await knex.schema.dropTableIfExists('customers');
  await knex.schema.dropTableIfExists('suppliers');
  await knex.schema.dropTableIfExists('items');
  await knex.schema.dropTableIfExists('units');
  await knex.schema.dropTableIfExists('warehouses');
  await knex.schema.dropTableIfExists('warehouse_types');
  await knex.schema.dropTableIfExists('locations');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('organizations');
};
