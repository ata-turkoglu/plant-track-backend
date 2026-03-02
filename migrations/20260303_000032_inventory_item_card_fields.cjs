/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasConstraint = async (tableName, constraintName) => {
    const rows = await knex
      .select('c.conname')
      .from('pg_constraint as c')
      .join('pg_class as t', 'c.conrelid', 't.oid')
      .join('pg_namespace as n', 't.relnamespace', 'n.oid')
      .whereRaw('n.nspname = current_schema()')
      .andWhere('t.relname', tableName)
      .andWhere('c.conname', constraintName)
      .limit(1);

    return rows.length > 0;
  };

  const hasTable = await knex.schema.hasTable('inventory_item_card_fields');
  if (!hasTable) {
    await knex.schema.createTable('inventory_item_card_fields', (t) => {
      t.increments('id').primary();

      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      t
        .integer('inventory_item_card_id')
        .notNullable()
        .references('id')
        .inTable('inventory_item_cards')
        .onDelete('CASCADE');

      t.string('name', 128).notNullable();
      t.string('label', 255).notNullable();
      t.string('data_type', 16).notNullable().defaultTo('text');
      t.integer('unit_id').nullable().references('id').inTable('units').onDelete('RESTRICT');
      t.boolean('required').notNullable().defaultTo(false);
      t.integer('sort_order').notNullable().defaultTo(0);
      t.boolean('active').notNullable().defaultTo(true);
      t.timestamps(true, true);

      t.index(['organization_id']);
      t.index(['inventory_item_card_id']);
      t.index(['organization_id', 'inventory_item_card_id']);
      t.index(['unit_id']);
    });
  }

  const hasDataTypeConstraint = await hasConstraint(
    'inventory_item_card_fields',
    'inventory_item_card_fields_data_type_check'
  );
  if (!hasDataTypeConstraint) {
    await knex.raw(
      `alter table inventory_item_card_fields
         add constraint inventory_item_card_fields_data_type_check
         check (data_type in ('text','number','boolean','date'))`
    );
  }

  const hasSortOrderConstraint = await hasConstraint(
    'inventory_item_card_fields',
    'inventory_item_card_fields_sort_order_check'
  );
  if (!hasSortOrderConstraint) {
    await knex.raw(
      `alter table inventory_item_card_fields
         add constraint inventory_item_card_fields_sort_order_check
         check (sort_order >= 0)`
    );
  }

  await knex.raw('drop index if exists inventory_item_card_fields_card_name_uq');
  await knex.raw(
    'create unique index inventory_item_card_fields_card_name_uq on inventory_item_card_fields (inventory_item_card_id, lower(name))'
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('inventory_item_card_fields');
  if (!hasTable) return;

  await knex.raw('drop index if exists inventory_item_card_fields_card_name_uq');
  await knex.raw('alter table inventory_item_card_fields drop constraint if exists inventory_item_card_fields_data_type_check');
  await knex.raw('alter table inventory_item_card_fields drop constraint if exists inventory_item_card_fields_sort_order_check');
  await knex.schema.dropTableIfExists('inventory_item_card_fields');
};
