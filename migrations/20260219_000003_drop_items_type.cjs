/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasItems = await knex.schema.hasTable('items');
  if (!hasItems) return;

  const hasType = await knex.schema.hasColumn('items', 'type');
  if (!hasType) return;

  await knex.raw('drop index if exists items_organization_id_type_index');

  await knex.schema.alterTable('items', (t) => {
    t.dropColumn('type');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasItems = await knex.schema.hasTable('items');
  if (!hasItems) return;

  const hasType = await knex.schema.hasColumn('items', 'type');
  if (!hasType) {
    await knex.schema.alterTable('items', (t) => {
      t.string('type', 32).nullable();
    });
  }

  await knex.raw(
    `update items i
     set type = wt.code
     from warehouse_types wt
     where i.warehouse_type_id = wt.id
       and i.type is null`
  );

  await knex.raw("update items set type = 'RAW_MATERIAL' where type is null");

  await knex.schema.alterTable('items', (t) => {
    t.string('type', 32).notNullable().alter();
    t.index(['organization_id', 'type']);
  });
};
