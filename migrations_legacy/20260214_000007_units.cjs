/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('units', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t.string('code', 16).notNullable();
    t.string('name', 64).notNullable();
    t.string('symbol', 16).nullable();
    t.boolean('system').notNullable().defaultTo(true);
    t.boolean('active').notNullable().defaultTo(true);

    t.timestamps(true, true);

    t.unique(['organization_id', 'code']);
    t.index(['organization_id']);
    t.index(['organization_id', 'active']);
  });

  // Add FK to items (nullable during backfill).
  await knex.schema.alterTable('items', (t) => {
    t.integer('unit_id').nullable().references('id').inTable('units');
    t.index(['unit_id']);
  });

  // Seed default units for every organization.
  const organizations = await knex('organizations').select(['id']);
  for (const org of organizations) {
    await knex('units').insert([
      { organization_id: org.id, code: 'adet', name: 'Adet', symbol: 'adet', system: true, active: true },
      { organization_id: org.id, code: 'kg', name: 'Kilogram', symbol: 'kg', system: true, active: true },
      { organization_id: org.id, code: 'g', name: 'Gram', symbol: 'g', system: true, active: true },
      { organization_id: org.id, code: 'lt', name: 'Litre', symbol: 'L', system: true, active: true },
      { organization_id: org.id, code: 'ml', name: 'Mililitre', symbol: 'mL', system: true, active: true },
      { organization_id: org.id, code: 'm', name: 'Metre', symbol: 'm', system: true, active: true }
    ]);
  }

  // Backfill items.unit_id from items.uom where possible, else default to 'adet'.
  await knex.raw(
    `update items i
     set unit_id = u.id
     from units u
     where u.organization_id = i.organization_id
       and lower(u.code) = lower(i.uom)`
  );

  await knex.raw(
    `update items i
     set unit_id = u.id
     from units u
     where i.unit_id is null
       and u.organization_id = i.organization_id
       and u.code = 'adet'`
  );

  await knex.schema.alterTable('items', (t) => {
    t.integer('unit_id').notNullable().alter();
  });

  // Keep legacy uom for now (read-only) to avoid breaking older data paths.
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('items', (t) => {
    t.dropIndex(['unit_id']);
    t.dropColumn('unit_id');
  });

  await knex.schema.dropTableIfExists('units');
};
