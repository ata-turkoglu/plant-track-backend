import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('organizations', (table) => {
    table.bigIncrements('id').primary();
    table.string('code', 64).notNullable().unique();
    table.string('name', 180).notNullable();
    table.string('city', 120).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['name']);
    table.index(['is_active']);
  });

  await knex.schema.createTable('organization_units', (table) => {
    table.bigIncrements('id').primary();
    table
      .bigInteger('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('RESTRICT');
    table
      .bigInteger('parent_unit_id')
      .nullable()
      .references('id')
      .inTable('organization_units')
      .onDelete('SET NULL');
    table.string('code', 64).notNullable().unique();
    table.string('name', 180).notNullable();
    table.string('kind', 64).nullable();
    table.string('city', 120).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['organization_id']);
    table.index(['parent_unit_id']);
    table.index(['name']);
    table.index(['is_active']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('organization_units');
  await knex.schema.dropTableIfExists('organizations');
}
