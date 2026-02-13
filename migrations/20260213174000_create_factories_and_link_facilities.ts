import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('factories', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('business_id').notNullable().references('id').inTable('businesses').onDelete('RESTRICT');
    table.string('code', 64).notNullable().unique();
    table.string('name', 160).notNullable();
    table.string('city', 120).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['business_id']);
    table.index(['name']);
    table.index(['is_active']);
  });

  const firstBusiness = await knex('businesses').select<{ id: number }>('id').orderBy('id', 'asc').first();
  if (!firstBusiness) {
    throw new Error('At least one business is required before linking facilities.');
  }

  const [defaultFactory] = await knex('factories')
    .insert({
      business_id: firstBusiness.id,
      code: 'FCT-001',
      name: 'Merkez Fabrika',
      city: 'Aydin',
      is_active: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    })
    .returning<{ id: number }[]>('id');

  await knex.schema.alterTable('plants', (table) => {
    table.bigInteger('factory_id').nullable().references('id').inTable('factories').onDelete('RESTRICT');
    table.index(['factory_id']);
  });

  await knex('plants').whereNull('factory_id').update({ factory_id: defaultFactory.id });

  await knex.schema.alterTable('plants', (table) => {
    table.bigInteger('factory_id').notNullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('plants', (table) => {
    table.dropColumn('factory_id');
  });

  await knex.schema.dropTableIfExists('factories');
}
