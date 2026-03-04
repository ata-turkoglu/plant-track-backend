/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasAssetCards = await knex.schema.hasTable('asset_cards');
  if (hasAssetCards) {
    const hasDescription = await knex.schema.hasColumn('asset_cards', 'description');
    if (!hasDescription) {
      await knex.schema.alterTable('asset_cards', (t) => {
        t.text('description').nullable();
      });
    }
  }

  const hasAssetTypes = await knex.schema.hasTable('asset_types');
  if (hasAssetTypes) {
    const hasDescription = await knex.schema.hasColumn('asset_types', 'description');
    if (!hasDescription) {
      await knex.schema.alterTable('asset_types', (t) => {
        t.text('description').nullable();
      });
    }
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasAssetCards = await knex.schema.hasTable('asset_cards');
  if (hasAssetCards) {
    const hasDescription = await knex.schema.hasColumn('asset_cards', 'description');
    if (hasDescription) {
      await knex.schema.alterTable('asset_cards', (t) => {
        t.dropColumn('description');
      });
    }
  }

  const hasAssetTypes = await knex.schema.hasTable('asset_types');
  if (hasAssetTypes) {
    const hasDescription = await knex.schema.hasColumn('asset_types', 'description');
    if (hasDescription) {
      await knex.schema.alterTable('asset_types', (t) => {
        t.dropColumn('description');
      });
    }
  }
};
