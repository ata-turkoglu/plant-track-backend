/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('warehouse_types', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t.string('code', 64).notNullable();
    t.string('name', 255).notNullable();
    t.text('description').nullable();
    t.boolean('system').notNullable().defaultTo(true);

    t.timestamps(true, true);

    t.unique(['organization_id', 'code']);
    t.index(['organization_id']);
  });

  // Add FK column (nullable during backfill).
  await knex.schema.alterTable('warehouses', (t) => {
    t.integer('warehouse_type_id').nullable().references('id').inTable('warehouse_types');
    t.index(['warehouse_type_id']);
  });

  // Seed default types for every organization.
  const organizations = await knex('organizations').select(['id']);
  for (const org of organizations) {
    await knex('warehouse_types').insert([
      {
        organization_id: org.id,
        code: 'RAW_MATERIAL',
        name: 'Hammadde',
        description: 'Hammadde deposu',
        system: true
      },
      {
        organization_id: org.id,
        code: 'SPARE_PART',
        name: 'Yedek Parca',
        description: 'Yedek parca deposu',
        system: true
      },
      {
        organization_id: org.id,
        code: 'FINISHED_GOOD',
        name: 'Urun',
        description: 'Urun deposu',
        system: true
      }
    ]);
  }

  const hasType = await knex.schema.hasColumn('warehouses', 'type');

  if (hasType) {
    // Map existing warehouses.type to the seeded warehouse_types.
    await knex.raw(
      `update warehouses w
       set warehouse_type_id = wt.id
       from warehouse_types wt
       where wt.organization_id = w.organization_id
         and wt.code = w.type`
    );
  }

  // Any remaining nulls default to RAW_MATERIAL.
  await knex.raw(
    `update warehouses w
     set warehouse_type_id = wt.id
     from warehouse_types wt
     where w.warehouse_type_id is null
       and wt.organization_id = w.organization_id
       and wt.code = 'RAW_MATERIAL'`
  );

  await knex.schema.alterTable('warehouses', (t) => {
    t.integer('warehouse_type_id').notNullable().alter();
  });

  // Remove legacy type column/constraint if present.
  await knex.raw('alter table warehouses drop constraint if exists warehouses_type_check');
  await knex.raw('alter table warehouses drop column if exists type');
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  // Recreate legacy type column as RAW_MATERIAL for all rows (best-effort rollback).
  const hasType = await knex.schema.hasColumn('warehouses', 'type');
  if (!hasType) {
    await knex.schema.alterTable('warehouses', (t) => {
      t.string('type', 32).notNullable().defaultTo('RAW_MATERIAL');
    });
    await knex.raw(
      "alter table warehouses add constraint warehouses_type_check check (type in ('RAW_MATERIAL','SPARE_PART','FINISHED_GOOD'))"
    );
  }

  await knex.schema.alterTable('warehouses', (t) => {
    t.dropIndex(['warehouse_type_id']);
    t.dropColumn('warehouse_type_id');
  });

  await knex.schema.dropTableIfExists('warehouse_types');
};
