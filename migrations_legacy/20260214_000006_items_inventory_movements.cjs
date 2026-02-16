/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('items', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // Flexible for future: can be RAW_MATERIAL/SPARE_PART/PRODUCT or user-defined.
    t.string('type', 32).notNullable();
    t.string('code', 64).notNullable();
    t.string('name', 255).notNullable();
    t.string('uom', 16).notNullable();
    t.boolean('active').notNullable().defaultTo(true);

    t.timestamps(true, true);

    t.unique(['organization_id', 'code']);
    t.index(['organization_id']);
    t.index(['organization_id', 'type']);
  });

  await knex.schema.createTable('inventory_movements', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t
      .integer('warehouse_id')
      .notNullable()
      .references('id')
      .inTable('warehouses');

    // Optional for later: zone/bin style location inside a warehouse.
    t.integer('location_id').nullable().references('id').inTable('locations');

    t
      .integer('item_id')
      .notNullable()
      .references('id')
      .inTable('items');

    t.string('movement_type', 16).notNullable();
    t.decimal('quantity', 18, 3).notNullable();
    t.string('uom', 16).notNullable();

    // Generic reference hook (purchase order, production order, maintenance, etc.).
    t.string('reference_type', 64).nullable();
    t.string('reference_id', 64).nullable();

    t.text('note').nullable();

    t.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.integer('created_by_user_id').nullable().references('id').inTable('users');

    t.timestamps(true, true);

    t.index(['organization_id']);
    t.index(['organization_id', 'occurred_at']);
    t.index(['organization_id', 'warehouse_id']);
    t.index(['organization_id', 'item_id']);
  });

  await knex.raw(
    "alter table inventory_movements add constraint inventory_movements_type_check check (movement_type in ('IN','OUT','TRANSFER','ADJUSTMENT'))"
  );
  await knex.raw('alter table inventory_movements add constraint inventory_movements_qty_check check (quantity > 0)');
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('alter table inventory_movements drop constraint if exists inventory_movements_qty_check');
  await knex.raw('alter table inventory_movements drop constraint if exists inventory_movements_type_check');
  await knex.schema.dropTableIfExists('inventory_movements');
  await knex.schema.dropTableIfExists('items');
};
