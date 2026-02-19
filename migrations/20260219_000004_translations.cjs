/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasTranslations = await knex.schema.hasTable('translations');
  if (hasTranslations) return;

  await knex.schema.createTable('translations', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t.string('namespace', 64).notNullable();
    t.string('entry_key', 128).notNullable();
    t.string('locale', 16).notNullable();
    t.text('value').notNullable();

    t.timestamps(true, true);

    t.unique(['organization_id', 'namespace', 'entry_key', 'locale']);
    t.index(['organization_id']);
    t.index(['organization_id', 'locale']);
    t.index(['organization_id', 'namespace']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('translations');
};
