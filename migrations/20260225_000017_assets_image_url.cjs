/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasAssets = await knex.schema.hasTable('assets');
  if (!hasAssets) return;

  const hasImageUrl = await knex.schema.hasColumn('assets', 'image_url');
  if (hasImageUrl) return;

  await knex.schema.alterTable('assets', (t) => {
    t.text('image_url').nullable();
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasAssets = await knex.schema.hasTable('assets');
  if (!hasAssets) return;

  const hasImageUrl = await knex.schema.hasColumn('assets', 'image_url');
  if (!hasImageUrl) return;

  await knex.schema.alterTable('assets', (t) => {
    t.dropColumn('image_url');
  });
};
