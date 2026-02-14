/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('warehouses', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t
      .integer('location_id')
      .notNullable()
      .references('id')
      .inTable('locations');

    t.string('name', 255).notNullable();

    t.timestamps(true, true);

    t.index(['organization_id']);
    t.index(['location_id']);
    t.index(['organization_id', 'location_id']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('warehouses');
};
