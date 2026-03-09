/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasUnits = await knex.schema.hasTable('units');
  if (!hasUnits) return;

  const hasDimension = await knex.schema.hasColumn('units', 'dimension');
  if (!hasDimension) {
    await knex.schema.alterTable('units', (t) => {
      t.string('dimension', 16).nullable();
    });
  }

  await knex.raw(`
    update units
    set dimension = case
      when lower(code) in ('piece','adet','pair','dozen','score','hundred','thousand','mesh') then 'COUNT'
      when lower(code) in ('mcg','mg','g','dag','hg','kg','quintal','ton','oz','lb','stone') then 'MASS'
      when lower(code) in ('ul','ml','cl','dl','l','lt','hl','m3','tsp_us','tbsp_us','floz_us','cup_us','pt_us','qt_us','gal_us','floz_imp','pt_imp','qt_imp','gal_imp') then 'VOLUME'
      when lower(code) in ('um','micron','mm','cm','dm','m','dam','hm','km','mil','inch','ft','yd','mi','nmi') then 'LENGTH'
      when lower(code) in ('mm2','cm2','dm2','m2','are','ha','km2','in2','ft2','yd2','acre') then 'AREA'
      when lower(code) in ('ms','s','min','h','day','week') then 'TIME'
      else coalesce(dimension, 'COUNT')
    end
  `);

  await knex.raw("update units set dimension = 'COUNT' where dimension is null");

  await knex.schema.alterTable('units', (t) => {
    t.string('dimension', 16).notNullable().alter();
  });

  await knex.raw('alter table units drop constraint if exists units_dimension_check');
  await knex.raw(
    "alter table units add constraint units_dimension_check check (dimension in ('COUNT','MASS','VOLUME','LENGTH','AREA','TIME'))"
  );
  await knex.raw('create index if not exists units_organization_id_dimension_index on units (organization_id, dimension)');

  const hasUnitConversions = await knex.schema.hasTable('unit_conversions');
  if (!hasUnitConversions) {
    await knex.schema.createTable('unit_conversions', (t) => {
      t.increments('id').primary();
      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      t.integer('from_unit_id').notNullable().references('id').inTable('units').onDelete('CASCADE');
      t.integer('to_unit_id').notNullable().references('id').inTable('units').onDelete('CASCADE');
      t.decimal('factor', 30, 12).notNullable();
      t.boolean('system').notNullable().defaultTo(false);
      t.timestamps(true, true);

      t.unique(['organization_id', 'from_unit_id', 'to_unit_id']);
      t.index(['organization_id']);
      t.index(['organization_id', 'from_unit_id']);
      t.index(['organization_id', 'to_unit_id']);
    });
    await knex.raw(
      'alter table unit_conversions add constraint unit_conversions_factor_positive_check check (factor > 0)'
    );
    await knex.raw(
      'alter table unit_conversions add constraint unit_conversions_from_to_check check (from_unit_id <> to_unit_id)'
    );
  }

  const seedConversions = [
    ['pair', 'piece', '2'],
    ['dozen', 'piece', '12'],
    ['score', 'piece', '20'],
    ['hundred', 'piece', '100'],
    ['thousand', 'piece', '1000'],

    ['mcg', 'g', '0.000001'],
    ['mg', 'g', '0.001'],
    ['dag', 'g', '10'],
    ['hg', 'g', '100'],
    ['kg', 'g', '1000'],
    ['quintal', 'g', '100000'],
    ['ton', 'g', '1000000'],
    ['oz', 'g', '28.349523125'],
    ['lb', 'g', '453.59237'],
    ['stone', 'g', '6350.29318'],

    ['ul', 'ml', '0.001'],
    ['cl', 'ml', '10'],
    ['dl', 'ml', '100'],
    ['l', 'ml', '1000'],
    ['lt', 'ml', '1000'],
    ['hl', 'ml', '100000'],
    ['m3', 'ml', '1000000'],
    ['tsp_us', 'ml', '4.92892159375'],
    ['tbsp_us', 'ml', '14.78676478125'],
    ['floz_us', 'ml', '29.5735295625'],
    ['cup_us', 'ml', '236.5882365'],
    ['pt_us', 'ml', '473.176473'],
    ['qt_us', 'ml', '946.352946'],
    ['gal_us', 'ml', '3785.411784'],
    ['floz_imp', 'ml', '28.4130625'],
    ['pt_imp', 'ml', '568.26125'],
    ['qt_imp', 'ml', '1136.5225'],
    ['gal_imp', 'ml', '4546.09'],

    ['um', 'mm', '0.001'],
    ['micron', 'mm', '0.001'],
    ['cm', 'mm', '10'],
    ['dm', 'mm', '100'],
    ['m', 'mm', '1000'],
    ['dam', 'mm', '10000'],
    ['hm', 'mm', '100000'],
    ['km', 'mm', '1000000'],
    ['mil', 'mm', '0.0254'],
    ['inch', 'mm', '25.4'],
    ['ft', 'mm', '304.8'],
    ['yd', 'mm', '914.4'],
    ['mi', 'mm', '1609344'],
    ['nmi', 'mm', '1852000'],

    ['cm2', 'mm2', '100'],
    ['dm2', 'mm2', '10000'],
    ['m2', 'mm2', '1000000'],
    ['are', 'mm2', '100000000'],
    ['ha', 'mm2', '10000000000'],
    ['km2', 'mm2', '1000000000000'],
    ['in2', 'mm2', '645.16'],
    ['ft2', 'mm2', '92903.04'],
    ['yd2', 'mm2', '836127.36'],
    ['acre', 'mm2', '4046856422.4'],

    ['ms', 's', '0.001'],
    ['min', 's', '60'],
    ['h', 's', '3600'],
    ['day', 's', '86400'],
    ['week', 's', '604800']
  ];

  for (const [fromCode, toCode, factor] of seedConversions) {
    await knex.raw(
      `
        insert into unit_conversions (organization_id, from_unit_id, to_unit_id, factor, system)
        select uf.organization_id, uf.id, ut.id, ?::numeric, true
        from units uf
        inner join units ut
          on ut.organization_id = uf.organization_id
         and lower(ut.code) = lower(?)
        where lower(uf.code) = lower(?)
        on conflict (organization_id, from_unit_id, to_unit_id) do nothing
      `,
      [factor, toCode, fromCode]
    );
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasUnitConversions = await knex.schema.hasTable('unit_conversions');
  if (hasUnitConversions) {
    await knex.raw('alter table unit_conversions drop constraint if exists unit_conversions_from_to_check');
    await knex.raw('alter table unit_conversions drop constraint if exists unit_conversions_factor_positive_check');
    await knex.schema.dropTableIfExists('unit_conversions');
  }

  const hasUnits = await knex.schema.hasTable('units');
  if (!hasUnits) return;

  await knex.raw('drop index if exists units_organization_id_dimension_index');
  await knex.raw('alter table units drop constraint if exists units_dimension_check');

  const hasDimension = await knex.schema.hasColumn('units', 'dimension');
  if (hasDimension) {
    await knex.schema.alterTable('units', (t) => {
      t.dropColumn('dimension');
    });
  }
};
