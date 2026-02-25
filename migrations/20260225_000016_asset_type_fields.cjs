/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasAssetTypes = await knex.schema.hasTable('asset_types');
  if (!hasAssetTypes) return;

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

  const hasAssetTypeFields = await knex.schema.hasTable('asset_type_fields');
  if (!hasAssetTypeFields) {
    await knex.schema.createTable('asset_type_fields', (t) => {
      t.increments('id').primary();

      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      t
        .integer('asset_type_id')
        .notNullable()
        .references('id')
        .inTable('asset_types')
        .onDelete('CASCADE');

      t.string('name', 128).notNullable();
      t.string('label', 255).notNullable();
      t.string('input_type', 16).notNullable().defaultTo('text');
      t.integer('unit_id').nullable().references('id').inTable('units').onDelete('RESTRICT');
      t.boolean('required').notNullable().defaultTo(false);
      t.integer('sort_order').notNullable().defaultTo(0);
      t.boolean('active').notNullable().defaultTo(true);
      t.timestamps(true, true);

      t.index(['organization_id']);
      t.index(['asset_type_id']);
      t.index(['organization_id', 'asset_type_id']);
      t.index(['unit_id']);
    });
  }

  const hasInputTypeConstraint = await hasConstraint('asset_type_fields', 'asset_type_fields_input_type_check');
  if (!hasInputTypeConstraint) {
    await knex.raw(
      `alter table asset_type_fields
         add constraint asset_type_fields_input_type_check
         check (input_type in ('text','number','boolean','date'))`
    );
  }

  const hasSortOrderConstraint = await hasConstraint('asset_type_fields', 'asset_type_fields_sort_order_check');
  if (!hasSortOrderConstraint) {
    await knex.raw(
      `alter table asset_type_fields
         add constraint asset_type_fields_sort_order_check
         check (sort_order >= 0)`
    );
  }

  await knex.raw('drop index if exists asset_type_fields_type_name_uq');
  await knex.raw('create unique index asset_type_fields_type_name_uq on asset_type_fields (asset_type_id, lower(name))');

  const hasFieldSchemaJson = await knex.schema.hasColumn('asset_types', 'field_schema_json');
  if (hasFieldSchemaJson) {
    await knex.schema.alterTable('asset_types', (t) => {
      t.dropColumn('field_schema_json');
    });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasAssetTypes = await knex.schema.hasTable('asset_types');
  if (hasAssetTypes) {
    const hasFieldSchemaJson = await knex.schema.hasColumn('asset_types', 'field_schema_json');
    if (!hasFieldSchemaJson) {
      await knex.schema.alterTable('asset_types', (t) => {
        t.jsonb('field_schema_json').nullable();
      });
    }
  }

  const hasAssetTypeFields = await knex.schema.hasTable('asset_type_fields');
  if (hasAssetTypeFields) {
    await knex.raw('drop index if exists asset_type_fields_type_name_uq');
    await knex.raw('alter table asset_type_fields drop constraint if exists asset_type_fields_input_type_check');
    await knex.raw('alter table asset_type_fields drop constraint if exists asset_type_fields_sort_order_check');

    await knex.schema.dropTableIfExists('asset_type_fields');
  }
};
