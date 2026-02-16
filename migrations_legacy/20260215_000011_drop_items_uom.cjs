/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasUom = await knex.schema.hasColumn('items', 'uom');
  if (hasUom) {
    await knex.schema.alterTable('items', (t) => {
      t.dropColumn('uom');
    });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasUom = await knex.schema.hasColumn('items', 'uom');
  if (!hasUom) {
    await knex.schema.alterTable('items', (t) => {
      t.string('uom', 16).notNullable().defaultTo('adet');
    });
  }
};

