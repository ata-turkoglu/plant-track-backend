import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('businesses', (table) => {
    table.bigIncrements('id').primary();
    table.string('code', 64).notNullable().unique();
    table.string('name', 180).notNullable();
    table.string('city', 120).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['name']);
    table.index(['is_active']);
  });

  const [defaultBusiness] = await knex('businesses')
    .insert({
      code: 'ISL-001',
      name: 'Merkez Isletme',
      city: 'Aydin',
      is_active: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    })
    .returning<{ id: number }[]>('id');

  await knex.schema.alterTable('plants', (table) => {
    table.bigInteger('business_id').nullable().references('id').inTable('businesses').onDelete('RESTRICT');
    table.index(['business_id']);
  });

  await knex('plants').whereNull('business_id').update({ business_id: defaultBusiness.id });

  await knex.schema.alterTable('plants', (table) => {
    table.bigInteger('business_id').notNullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('plants', (table) => {
    table.dropColumn('business_id');
  });

  await knex.schema.dropTableIfExists('businesses');
}
