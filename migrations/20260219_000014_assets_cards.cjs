/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // 1) Asset types (per organization)
  const hasAssetTypes = await knex.schema.hasTable('asset_types');
  if (!hasAssetTypes) {
    await knex.schema.createTable('asset_types', (t) => {
      t.increments('id').primary();

      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      t.string('code', 64).notNullable();
      t.string('name', 255).notNullable();
      t.boolean('active').notNullable().defaultTo(true);

      // Flexible schema for dynamic fields; UI can render based on this later.
      t.jsonb('field_schema_json').nullable();

      t.timestamps(true, true);

      t.unique(['organization_id', 'code']);
      t.index(['organization_id']);
      t.index(['organization_id', 'active']);
    });
  }

  // 2) Rename legacy "machines" -> "assets" (if present)
  const hasMachines = await knex.schema.hasTable('machines');
  const hasAssets = await knex.schema.hasTable('assets');
  if (hasMachines && !hasAssets) {
    await knex.schema.renameTable('machines', 'assets');
  }

  const nowHasAssets = await knex.schema.hasTable('assets');
  if (!nowHasAssets) return;

  // Drop legacy uniqueness on (organization_id, name) to allow repeating part names (e.g. "Electric motor").
  await knex.raw('alter table assets drop constraint if exists machines_organization_id_name_unique');
  await knex.raw('alter table assets drop constraint if exists assets_organization_id_name_unique');

  // 3) Extend assets table for hierarchy + location + dynamic attributes + runtime tracking
  const ensureColumn = async (col, fn) => {
    const exists = await knex.schema.hasColumn('assets', col);
    if (!exists) {
      await knex.schema.alterTable('assets', fn);
    }
  };

  await ensureColumn('code', (t) => {
    t.string('code', 64).nullable();
  });

  await ensureColumn('location_id', (t) => {
    t
      .integer('location_id')
      .nullable()
      .references('id')
      .inTable('locations')
      .onDelete('RESTRICT');
  });

  await ensureColumn('parent_asset_id', (t) => {
    t
      .integer('parent_asset_id')
      .nullable()
      .references('id')
      .inTable('assets')
      .onDelete('SET NULL');
  });

  await ensureColumn('asset_type_id', (t) => {
    t
      .integer('asset_type_id')
      .nullable()
      .references('id')
      .inTable('asset_types')
      .onDelete('SET NULL');
  });

  await ensureColumn('attributes_json', (t) => {
    t.jsonb('attributes_json').nullable();
  });

  await ensureColumn('current_state', (t) => {
    t.string('current_state', 32).notNullable().defaultTo('STOPPED');
  });

  await ensureColumn('running_since', (t) => {
    t.timestamp('running_since', { useTz: true }).nullable();
  });

  await ensureColumn('runtime_seconds', (t) => {
    t.bigInteger('runtime_seconds').notNullable().defaultTo(0);
  });

  // Code uniqueness (optional code, unique per org, case-insensitive)
  await knex.raw('drop index if exists assets_org_code_uq');
  await knex.raw('create unique index assets_org_code_uq on assets (organization_id, lower(code)) where code is not null');

  // Helpful indexes
  await knex.raw('drop index if exists assets_org_location_idx');
  await knex.raw('create index assets_org_location_idx on assets (organization_id, location_id)');

  await knex.raw('drop index if exists assets_org_parent_idx');
  await knex.raw('create index assets_org_parent_idx on assets (organization_id, parent_asset_id)');

  await knex.raw('drop index if exists assets_org_type_idx');
  await knex.raw('create index assets_org_type_idx on assets (organization_id, asset_type_id)');

  // 4) Asset BOM (required/compatible spare parts with quantities)
  const hasBom = await knex.schema.hasTable('asset_bom_lines');
  if (!hasBom) {
    await knex.schema.createTable('asset_bom_lines', (t) => {
      t.increments('id').primary();

      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      t.integer('asset_id').notNullable().references('id').inTable('assets').onDelete('CASCADE');
      t.integer('item_id').notNullable().references('id').inTable('items').onDelete('RESTRICT');
      t.integer('unit_id').notNullable().references('id').inTable('units').onDelete('RESTRICT');

      t.decimal('quantity', 18, 3).notNullable();
      t.boolean('preferred').notNullable().defaultTo(true);
      t.text('note').nullable();
      t.jsonb('meta_json').nullable();

      t.timestamps(true, true);

      t.index(['organization_id', 'asset_id']);
      t.index(['organization_id', 'item_id']);
      t.unique(['asset_id', 'item_id']);
    });

    await knex.raw(
      `alter table asset_bom_lines
         add constraint asset_bom_lines_qty_check check (quantity > 0)`
    );
  }

  // 5) Asset events (move + state change)
  const hasEvents = await knex.schema.hasTable('asset_events');
  if (!hasEvents) {
    await knex.schema.createTable('asset_events', (t) => {
      t.increments('id').primary();

      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      t.integer('asset_id').notNullable().references('id').inTable('assets').onDelete('CASCADE');
      t.string('event_type', 32).notNullable(); // MOVE | STATE
      t.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      t.integer('from_location_id').nullable().references('id').inTable('locations').onDelete('SET NULL');
      t.integer('to_location_id').nullable().references('id').inTable('locations').onDelete('SET NULL');

      t.string('from_state', 32).nullable();
      t.string('to_state', 32).nullable();

      t.text('note').nullable();
      t.jsonb('meta_json').nullable();
      t.integer('created_by_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');

      t.timestamps(true, true);

      t.index(['organization_id', 'occurred_at']);
      t.index(['asset_id', 'occurred_at']);
      t.index(['organization_id', 'asset_id', 'event_type']);
    });

    await knex.raw(
      `alter table asset_events
         add constraint asset_events_type_check check (event_type in ('MOVE','STATE'))`
    );
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down() {
  // No-op: this migration is not safely reversible once assets are referenced by nodes and history tables.
};

