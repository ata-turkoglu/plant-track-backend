/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasItems = await knex.schema.hasTable('items');
  if (!hasItems) return;

  const hasBrand = await knex.schema.hasColumn('items', 'brand');
  if (!hasBrand) {
    await knex.schema.alterTable('items', (t) => {
      t.string('brand', 255).nullable();
    });
  }

  const hasModel = await knex.schema.hasColumn('items', 'model');
  if (!hasModel) {
    await knex.schema.alterTable('items', (t) => {
      t.string('model', 255).nullable();
    });
  }

  const hasSizeSpec = await knex.schema.hasColumn('items', 'size_spec');
  if (!hasSizeSpec) {
    await knex.schema.alterTable('items', (t) => {
      t.string('size_spec', 255).nullable();
    });
  }

  const hasSizeUnitId = await knex.schema.hasColumn('items', 'size_unit_id');
  if (!hasSizeUnitId) {
    await knex.schema.alterTable('items', (t) => {
      t.integer('size_unit_id').nullable().references('id').inTable('units');
    });
    await knex.schema.alterTable('items', (t) => {
      t.index(['size_unit_id']);
    });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasItems = await knex.schema.hasTable('items');
  if (!hasItems) return;

  const hasSizeUnitId = await knex.schema.hasColumn('items', 'size_unit_id');
  if (hasSizeUnitId) {
    await knex.schema.alterTable('items', (t) => {
      t.dropIndex(['size_unit_id']);
      t.dropColumn('size_unit_id');
    });
  }

  const hasSizeSpec = await knex.schema.hasColumn('items', 'size_spec');
  if (hasSizeSpec) {
    await knex.schema.alterTable('items', (t) => {
      t.dropColumn('size_spec');
    });
  }

  const hasModel = await knex.schema.hasColumn('items', 'model');
  if (hasModel) {
    await knex.schema.alterTable('items', (t) => {
      t.dropColumn('model');
    });
  }

  const hasBrand = await knex.schema.hasColumn('items', 'brand');
  if (hasBrand) {
    await knex.schema.alterTable('items', (t) => {
      t.dropColumn('brand');
    });
  }
};
