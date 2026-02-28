/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasItems = await knex.schema.hasTable('items');
  if (!hasItems) return;

  const hasDescription = await knex.schema.hasColumn('items', 'description');
  if (hasDescription) return;

  await knex.schema.alterTable('items', (t) => {
    t.text('description').nullable();
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasItems = await knex.schema.hasTable('items');
  if (!hasItems) return;

  const hasDescription = await knex.schema.hasColumn('items', 'description');
  if (!hasDescription) return;

  await knex.schema.alterTable('items', (t) => {
    t.dropColumn('description');
  });
};

