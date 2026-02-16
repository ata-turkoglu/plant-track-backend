/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('items', (t) => {
    // Nullable during backfill.
    t.integer('warehouse_type_id').nullable().references('id').inTable('warehouse_types');
    t.index(['organization_id', 'warehouse_type_id']);
  });

  // Best-effort map legacy items.type -> warehouse_types.code.
  await knex.raw(
    `update items i
     set warehouse_type_id = wt.id
     from warehouse_types wt
     where wt.organization_id = i.organization_id
       and wt.code = i.type`
  );

  // Default any remaining nulls to RAW_MATERIAL.
  await knex.raw(
    `update items i
     set warehouse_type_id = wt.id
     from warehouse_types wt
     where i.warehouse_type_id is null
       and wt.organization_id = i.organization_id
       and wt.code = 'RAW_MATERIAL'`
  );

  await knex.schema.alterTable('items', (t) => {
    t.integer('warehouse_type_id').notNullable().alter();
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('items', (t) => {
    t.dropIndex(['organization_id', 'warehouse_type_id']);
    t.dropColumn('warehouse_type_id');
  });
};

