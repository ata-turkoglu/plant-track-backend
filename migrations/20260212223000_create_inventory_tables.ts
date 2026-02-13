import type { Knex } from 'knex';

const STOCK_TXN_TYPE = 'stock_transaction_type';
const STOCK_TXN_DIRECTION = 'stock_transaction_direction';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('products', (table) => {
    table.bigIncrements('id').primary();
    table.string('sku', 64).notNullable().unique();
    table.string('name', 255).notNullable();
    table.string('unit', 32).notNullable();
    table.string('category', 120).nullable();
    table.string('barcode', 120).nullable();
    table.decimal('min_stock', 14, 4).notNullable().defaultTo(0);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['name']);
    table.index(['is_active']);
  });

  await knex.schema.createTable('warehouses', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', 120).notNullable();
    table.string('code', 40).notNullable().unique();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('warehouse_locations', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('warehouse_id').notNullable().references('id').inTable('warehouses').onDelete('CASCADE');
    table.string('code', 40).notNullable();
    table.string('description', 255).nullable();

    table.unique(['warehouse_id', 'code']);
    table.index(['warehouse_id']);
  });

  await knex.schema.createTable('stock_transactions', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    table.bigInteger('warehouse_id').notNullable().references('id').inTable('warehouses').onDelete('RESTRICT');
    table
      .enu('type', ['IN', 'OUT', 'TRANSFER', 'ADJUST'], {
        useNative: true,
        enumName: STOCK_TXN_TYPE
      })
      .notNullable();
    table
      .enu('direction', ['IN', 'OUT'], {
        useNative: true,
        enumName: STOCK_TXN_DIRECTION
      })
      .notNullable();
    table.decimal('quantity', 14, 4).notNullable();
    table.string('unit', 32).notNullable();
    table.string('reference_type', 64).nullable();
    table.string('reference_id', 120).nullable();
    table.string('note', 500).nullable();
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['product_id', 'warehouse_id', 'created_at']);
    table.index(['warehouse_id', 'created_at']);
    table.index(['reference_type', 'reference_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('stock_transactions');
  await knex.schema.dropTableIfExists('warehouse_locations');
  await knex.schema.dropTableIfExists('warehouses');
  await knex.schema.dropTableIfExists('products');
  await knex.raw(`DROP TYPE IF EXISTS ${STOCK_TXN_DIRECTION}`);
  await knex.raw(`DROP TYPE IF EXISTS ${STOCK_TXN_TYPE}`);
}
