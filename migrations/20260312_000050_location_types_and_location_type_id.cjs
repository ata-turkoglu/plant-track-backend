/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  const hasLocations = await knex.schema.hasTable('locations');
  if (!hasOrganizations || !hasLocations) return;

  const hasLocationTypes = await knex.schema.hasTable('location_types');
  if (!hasLocationTypes) {
    await knex.schema.createTable('location_types', (t) => {
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
      t.boolean('system').notNullable().defaultTo(false);
      t.timestamps(true, true);

      t.unique(['organization_id', 'code']);
      t.index(['organization_id']);
    });
  }

  await knex.raw(`
    insert into location_types (organization_id, code, name, description, system, created_at, updated_at)
    select
      o.id,
      d.code,
      d.name,
      d.description,
      true,
      now(),
      now()
    from organizations o
    cross join (
      values
        ('business_group', 'Business Group', 'Business grouping node'),
        ('factory', 'Factory', 'Factory / plant location'),
        ('other', 'Other', 'Other location type')
    ) as d(code, name, description)
    on conflict (organization_id, code) do nothing
  `);

  const hasLocationTypeId = await knex.schema.hasColumn('locations', 'location_type_id');
  if (!hasLocationTypeId) {
    await knex.schema.alterTable('locations', (t) => {
      t.integer('location_type_id').nullable().references('id').inTable('location_types');
      t.index(['location_type_id']);
    });
  }

  await knex.raw(`
    update locations l
    set location_type_id = lt.id
    from location_types lt
    where l.organization_id = lt.organization_id
      and lower(lt.code) = 'other'
      and l.location_type_id is null
  `);

  await knex.schema.alterTable('locations', (t) => {
    t.integer('location_type_id').notNullable().alter();
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasLocations = await knex.schema.hasTable('locations');
  if (hasLocations) {
    const hasLocationTypeId = await knex.schema.hasColumn('locations', 'location_type_id');
    if (hasLocationTypeId) {
      await knex.schema.alterTable('locations', (t) => {
        t.dropIndex(['location_type_id']);
        t.dropColumn('location_type_id');
      });
    }
  }

  const hasLocationTypes = await knex.schema.hasTable('location_types');
  if (hasLocationTypes) {
    await knex.schema.dropTable('location_types');
  }
};
