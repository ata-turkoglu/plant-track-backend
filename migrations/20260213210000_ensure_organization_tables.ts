import type { Knex } from 'knex';

const hasColumn = async (knex: Knex, table: string, column: string): Promise<boolean> => {
  const exists = await knex.schema.hasTable(table);
  if (!exists) {
    return false;
  }
  return knex.schema.hasColumn(table, column);
};

export async function up(knex: Knex): Promise<void> {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  if (!hasOrganizations) {
    await knex.schema.createTable('organizations', (table) => {
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
  }

  const hasOrganizationUnits = await knex.schema.hasTable('organization_units');
  if (!hasOrganizationUnits) {
    await knex.schema.createTable('organization_units', (table) => {
      table.bigIncrements('id').primary();
      table
        .bigInteger('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('RESTRICT');
      table
        .bigInteger('parent_unit_id')
        .nullable()
        .references('id')
        .inTable('organization_units')
        .onDelete('SET NULL');
      table.string('code', 64).notNullable().unique();
      table.string('name', 180).notNullable();
      table.string('kind', 64).nullable();
      table.string('city', 120).nullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id']);
      table.index(['parent_unit_id']);
      table.index(['name']);
      table.index(['is_active']);
    });
  }

  const organizationCountRow = await knex('organizations').count<{ count: string }>('id as count').first();
  const organizationCount = Number(organizationCountRow?.count ?? 0);
  if (organizationCount > 0) {
    return;
  }

  const hasBusinesses = await knex.schema.hasTable('businesses');
  if (!hasBusinesses) {
    return;
  }

  const hasFactories = await knex.schema.hasTable('factories');
  const hasPlants = await knex.schema.hasTable('plants');
  const plantsHasFactoryId = hasPlants ? await hasColumn(knex, 'plants', 'factory_id') : false;

  type BusinessRow = {
    id: number;
    code: string;
    name: string;
    city: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };

  type FactoryRow = {
    id: number;
    business_id: number;
    code: string;
    name: string;
    city: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };

  type PlantRow = {
    id: number;
    business_id: number;
    factory_id?: number | null;
    code: string;
    name: string;
    city: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };

  const businesses = await knex<BusinessRow>('businesses').select('*').orderBy('id', 'asc');
  const factories = hasFactories ? await knex<FactoryRow>('factories').select('*').orderBy('id', 'asc') : [];
  const plants = hasPlants ? await knex<PlantRow>('plants').select('*').orderBy('id', 'asc') : [];

  const organizationByBusinessId = new Map<number, number>();
  const businessUnitByBusinessId = new Map<number, number>();
  const factoryUnitByFactoryId = new Map<number, number>();

  for (const business of businesses) {
    const [organization] = await knex('organizations')
      .insert({
        code: business.code,
        name: business.name,
        city: business.city,
        is_active: business.is_active,
        created_at: business.created_at,
        updated_at: business.updated_at
      })
      .returning<{ id: number }[]>('id');

    organizationByBusinessId.set(business.id, organization.id);

    const [businessUnit] = await knex('organization_units')
      .insert({
        organization_id: organization.id,
        parent_unit_id: null,
        code: `${business.code}-UNIT`,
        name: business.name,
        kind: 'BUSINESS',
        city: business.city,
        is_active: business.is_active,
        created_at: business.created_at,
        updated_at: business.updated_at
      })
      .returning<{ id: number }[]>('id');

    businessUnitByBusinessId.set(business.id, businessUnit.id);
  }

  for (const factory of factories) {
    const organizationId = organizationByBusinessId.get(factory.business_id);
    const parentUnitId = businessUnitByBusinessId.get(factory.business_id);
    if (!organizationId || !parentUnitId) {
      continue;
    }

    const [factoryUnit] = await knex('organization_units')
      .insert({
        organization_id: organizationId,
        parent_unit_id: parentUnitId,
        code: factory.code,
        name: factory.name,
        kind: 'FACTORY',
        city: factory.city,
        is_active: factory.is_active,
        created_at: factory.created_at,
        updated_at: factory.updated_at
      })
      .returning<{ id: number }[]>('id');

    factoryUnitByFactoryId.set(factory.id, factoryUnit.id);
  }

  for (const plant of plants) {
    const organizationId = organizationByBusinessId.get(plant.business_id);
    if (!organizationId) {
      continue;
    }

    let parentUnitId = businessUnitByBusinessId.get(plant.business_id) ?? null;

    if (plantsHasFactoryId && plant.factory_id) {
      parentUnitId = factoryUnitByFactoryId.get(plant.factory_id) ?? parentUnitId;
    }

    await knex('organization_units').insert({
      organization_id: organizationId,
      parent_unit_id: parentUnitId,
      code: plant.code,
      name: plant.name,
      kind: 'FACILITY',
      city: plant.city,
      is_active: plant.is_active,
      created_at: plant.created_at,
      updated_at: plant.updated_at
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasOrganizationUnits = await knex.schema.hasTable('organization_units');
  const hasOrganizations = await knex.schema.hasTable('organizations');

  if (hasOrganizationUnits) {
    await knex.schema.dropTableIfExists('organization_units');
  }

  if (hasOrganizations) {
    await knex.schema.dropTableIfExists('organizations');
  }
}
