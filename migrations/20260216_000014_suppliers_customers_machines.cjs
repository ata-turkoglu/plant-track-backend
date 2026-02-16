/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
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
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('alter table suppliers drop constraint if exists suppliers_kind_check');
  await knex.schema.dropTableIfExists('machines');
  await knex.schema.dropTableIfExists('customers');
  await knex.schema.dropTableIfExists('suppliers');
};

