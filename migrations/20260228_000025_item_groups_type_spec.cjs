/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasItemGroups = await knex.schema.hasTable('item_groups');
  if (!hasItemGroups) return;

  const hasTypeSpec = await knex.schema.hasColumn('item_groups', 'type_spec');
  if (hasTypeSpec) return;

  await knex.schema.alterTable('item_groups', (t) => {
    t.string('type_spec', 255).nullable();
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasItemGroups = await knex.schema.hasTable('item_groups');
  if (!hasItemGroups) return;

  const hasTypeSpec = await knex.schema.hasColumn('item_groups', 'type_spec');
  if (!hasTypeSpec) return;

  await knex.schema.alterTable('item_groups', (t) => {
    t.dropColumn('type_spec');
  });
};

