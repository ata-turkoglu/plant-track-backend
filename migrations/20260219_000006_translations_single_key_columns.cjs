/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasTranslations = await knex.schema.hasTable('translations');
  if (!hasTranslations) return;

  const hasLocale = await knex.schema.hasColumn('translations', 'locale');
  const hasValue = await knex.schema.hasColumn('translations', 'value');
  const hasTr = await knex.schema.hasColumn('translations', 'tr');
  const hasEn = await knex.schema.hasColumn('translations', 'en');

  if (!hasLocale && !hasValue && hasTr && hasEn) return;

  await knex.schema.createTable('translations_new', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t.string('namespace', 64).notNullable();
    t.string('entry_key', 128).notNullable();
    t.text('tr').notNullable().defaultTo('');
    t.text('en').notNullable().defaultTo('');

    t.timestamps(true, true);

    t.unique(['organization_id', 'namespace', 'entry_key']);
    t.index(['organization_id']);
    t.index(['organization_id', 'namespace']);
  });

  await knex.raw(`
    insert into translations_new (organization_id, namespace, entry_key, tr, en, created_at, updated_at)
    select
      organization_id,
      namespace,
      entry_key,
      coalesce(max(case when locale = 'tr' then value end), '') as tr,
      coalesce(max(case when locale = 'en' then value end), '') as en,
      min(created_at) as created_at,
      max(updated_at) as updated_at
    from translations
    group by organization_id, namespace, entry_key
  `);

  await knex.schema.dropTable('translations');
  await knex.schema.renameTable('translations_new', 'translations');
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasTranslations = await knex.schema.hasTable('translations');
  if (!hasTranslations) return;

  const hasTr = await knex.schema.hasColumn('translations', 'tr');
  const hasEn = await knex.schema.hasColumn('translations', 'en');
  const hasLocale = await knex.schema.hasColumn('translations', 'locale');
  const hasValue = await knex.schema.hasColumn('translations', 'value');

  if (!hasTr && !hasEn && hasLocale && hasValue) return;

  await knex.schema.createTable('translations_old', (t) => {
    t.increments('id').primary();

    t
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    t.string('namespace', 64).notNullable();
    t.string('entry_key', 128).notNullable();
    t.string('locale', 16).notNullable();
    t.text('value').notNullable();

    t.timestamps(true, true);

    t.unique(['organization_id', 'namespace', 'entry_key', 'locale']);
    t.index(['organization_id']);
    t.index(['organization_id', 'locale']);
    t.index(['organization_id', 'namespace']);
  });

  await knex.raw(`
    insert into translations_old (organization_id, namespace, entry_key, locale, value, created_at, updated_at)
    select organization_id, namespace, entry_key, 'tr', tr, created_at, updated_at
    from translations
    where coalesce(tr, '') <> ''
  `);

  await knex.raw(`
    insert into translations_old (organization_id, namespace, entry_key, locale, value, created_at, updated_at)
    select organization_id, namespace, entry_key, 'en', en, created_at, updated_at
    from translations
    where coalesce(en, '') <> ''
  `);

  await knex.schema.dropTable('translations');
  await knex.schema.renameTable('translations_old', 'translations');
};
