/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_work_orders');
  if (!hasTable) return;

  const hasOpenImagesJson = await knex.schema.hasColumn('maintenance_work_orders', 'open_images_json');
  const hasCloseImagesJson = await knex.schema.hasColumn('maintenance_work_orders', 'close_images_json');

  if (!hasOpenImagesJson || !hasCloseImagesJson) {
    await knex.schema.alterTable('maintenance_work_orders', (t) => {
      if (!hasOpenImagesJson) t.jsonb('open_images_json').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
      if (!hasCloseImagesJson) t.jsonb('close_images_json').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_work_orders');
  if (!hasTable) return;

  const hasOpenImagesJson = await knex.schema.hasColumn('maintenance_work_orders', 'open_images_json');
  const hasCloseImagesJson = await knex.schema.hasColumn('maintenance_work_orders', 'close_images_json');

  if (hasOpenImagesJson || hasCloseImagesJson) {
    await knex.schema.alterTable('maintenance_work_orders', (t) => {
      if (hasOpenImagesJson) t.dropColumn('open_images_json');
      if (hasCloseImagesJson) t.dropColumn('close_images_json');
    });
  }
};
