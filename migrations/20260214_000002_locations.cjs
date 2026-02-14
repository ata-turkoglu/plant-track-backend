/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('locations', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t
      .integer('parent_id')
      .nullable()
      .references('id')
      .inTable('locations');

    t.string('name', 255).notNullable();

    t.timestamps(true, true);

    t.index(['organization_id']);
    t.index(['parent_id']);
    // Useful for listing children under a parent within an organization.
    t.index(['organization_id', 'parent_id']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('locations');
};
