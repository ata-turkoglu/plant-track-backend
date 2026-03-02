/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  const hasColumn = await knex.schema.hasColumn('users', 'default_currency_code');
  if (hasColumn) return;

  await knex.schema.alterTable('users', (t) => {
    t.string('default_currency_code', 8).nullable();
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  const hasColumn = await knex.schema.hasColumn('users', 'default_currency_code');
  if (!hasColumn) return;

  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('default_currency_code');
  });
};
