/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasItems = await knex.schema.hasTable('items');
  const hasWarehouseTypes = await knex.schema.hasTable('warehouse_types');
  const hasUnits = await knex.schema.hasTable('units');
  if (!hasItems || !hasWarehouseTypes || !hasUnits) return;

  const hasItemGroups = await knex.schema.hasTable('item_groups');
  if (!hasItemGroups) {
    await knex.schema.createTable('item_groups', (t) => {
      t.increments('id').primary();

      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      t.integer('warehouse_type_id').notNullable().references('id').inTable('warehouse_types').onDelete('RESTRICT');
      t.integer('unit_id').notNullable().references('id').inTable('units').onDelete('RESTRICT');

      t.string('code', 64).notNullable();
      t.string('name', 255).notNullable();

      // Specification text (e.g. 10W/20, 6204) + optional unit for the spec.
      t.string('size_spec', 255).nullable();
      t.integer('size_unit_id').nullable().references('id').inTable('units').onDelete('RESTRICT');

      t.boolean('active').notNullable().defaultTo(true);

      t.timestamps(true, true);

      t.unique(['organization_id', 'code']);
      t.index(['organization_id']);
      t.index(['organization_id', 'active']);
      t.index(['organization_id', 'warehouse_type_id']);
      t.index(['unit_id']);
      t.index(['size_unit_id']);
    });
  }

  const hasItemGroupId = await knex.schema.hasColumn('items', 'item_group_id');
  if (!hasItemGroupId) {
    await knex.schema.alterTable('items', (t) => {
      t.integer('item_group_id').nullable().references('id').inTable('item_groups').onDelete('RESTRICT');
    });
    await knex.schema.alterTable('items', (t) => {
      t.index(['organization_id', 'item_group_id']);
    });
  }

  const nowHasItemGroupId = await knex.schema.hasColumn('items', 'item_group_id');
  if (nowHasItemGroupId) {
    // Backfill item_groups from existing items (1:1), then link items -> item_groups.
    await knex.raw(`
      with upserted as (
        insert into item_groups (
          organization_id,
          warehouse_type_id,
          unit_id,
          code,
          name,
          size_spec,
          size_unit_id,
          active,
          created_at,
          updated_at
        )
        select
          i.organization_id,
          i.warehouse_type_id,
          i.unit_id,
          i.code,
          i.name,
          i.size_spec,
          i.size_unit_id,
          i.active,
          now(),
          now()
        from items i
        where i.item_group_id is null
        on conflict (organization_id, code) do update
        set
          warehouse_type_id = excluded.warehouse_type_id,
          unit_id = excluded.unit_id,
          name = excluded.name,
          size_spec = excluded.size_spec,
          size_unit_id = excluded.size_unit_id,
          active = excluded.active,
          updated_at = now()
        returning id, organization_id, code
      )
      update items i
      set item_group_id = u.id
      from upserted u
      where i.organization_id = u.organization_id
        and i.code = u.code
        and i.item_group_id is null
    `);

    const missing = await knex('items').whereNull('item_group_id').count('* as cnt');
    const missingCount = Number(missing?.[0]?.cnt ?? 0);
    if (missingCount === 0) {
      await knex.schema.alterTable('items', (t) => {
        t.integer('item_group_id').notNullable().alter();
      });
    }
  }

  // Move size_spec/size_unit_id to item_groups (canonical). Keep API shape by joining in queries.
  const hasItemSizeUnit = await knex.schema.hasColumn('items', 'size_unit_id');
  if (hasItemSizeUnit) {
    await knex.schema.alterTable('items', (t) => {
      t.dropColumn('size_unit_id');
    });
  }
  const hasItemSizeSpec = await knex.schema.hasColumn('items', 'size_spec');
  if (hasItemSizeSpec) {
    await knex.schema.alterTable('items', (t) => {
      t.dropColumn('size_spec');
    });
  }

  // Refactor asset_bom_lines to reference item_groups and drop preferred.
  const hasBom = await knex.schema.hasTable('asset_bom_lines');
  if (hasBom) {
    const hasBomGroupId = await knex.schema.hasColumn('asset_bom_lines', 'item_group_id');
    if (!hasBomGroupId) {
      await knex.schema.alterTable('asset_bom_lines', (t) => {
        t.integer('item_group_id').nullable().references('id').inTable('item_groups').onDelete('RESTRICT');
      });
    }

    const hasBomItemId = await knex.schema.hasColumn('asset_bom_lines', 'item_id');
    const nowHasBomGroupId = await knex.schema.hasColumn('asset_bom_lines', 'item_group_id');
    if (hasBomItemId && nowHasBomGroupId) {
      await knex.raw(`
        update asset_bom_lines abl
        set item_group_id = i.item_group_id
        from items i
        where abl.item_group_id is null
          and abl.item_id = i.id
      `);
    }

    await knex.raw('alter table asset_bom_lines drop constraint if exists asset_bom_lines_asset_id_item_id_unique');
    await knex.raw('drop index if exists asset_bom_lines_organization_id_item_id_index');
    await knex.raw('drop index if exists asset_bom_lines_item_id_index');

    const missingBom = await knex('asset_bom_lines').whereNull('item_group_id').count('* as cnt');
    const missingBomCount = Number(missingBom?.[0]?.cnt ?? 0);
    if (missingBomCount === 0) {
      await knex.schema.alterTable('asset_bom_lines', (t) => {
        t.integer('item_group_id').notNullable().alter();
      });
      await knex.raw('alter table asset_bom_lines add constraint asset_bom_lines_asset_id_item_group_id_uq unique (asset_id, item_group_id)');
      await knex.schema.alterTable('asset_bom_lines', (t) => {
        t.index(['organization_id', 'item_group_id']);
      });
    }

    const hasPreferred = await knex.schema.hasColumn('asset_bom_lines', 'preferred');
    if (hasPreferred) {
      await knex.schema.alterTable('asset_bom_lines', (t) => {
        t.dropColumn('preferred');
      });
    }

    if (hasBomItemId) {
      await knex.schema.alterTable('asset_bom_lines', (t) => {
        t.dropColumn('item_id');
      });
    }
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasItems = await knex.schema.hasTable('items');
  const hasItemGroups = await knex.schema.hasTable('item_groups');

  if (hasItems && hasItemGroups) {
    const hasSizeSpec = await knex.schema.hasColumn('items', 'size_spec');
    if (!hasSizeSpec) {
      await knex.schema.alterTable('items', (t) => {
        t.string('size_spec', 255).nullable();
      });
    }

    const hasSizeUnitId = await knex.schema.hasColumn('items', 'size_unit_id');
    if (!hasSizeUnitId) {
      await knex.schema.alterTable('items', (t) => {
        t.integer('size_unit_id').nullable().references('id').inTable('units').onDelete('RESTRICT');
      });
    }

    // Best-effort restore size fields from item_groups.
    await knex.raw(`
      update items i
      set
        size_spec = ig.size_spec,
        size_unit_id = ig.size_unit_id
      from item_groups ig
      where i.item_group_id = ig.id
    `);
  }

  const hasBom = await knex.schema.hasTable('asset_bom_lines');
  if (hasBom) {
    const hasItemId = await knex.schema.hasColumn('asset_bom_lines', 'item_id');
    if (!hasItemId) {
      await knex.schema.alterTable('asset_bom_lines', (t) => {
        t.integer('item_id').nullable().references('id').inTable('items').onDelete('RESTRICT');
      });
    }

    // Backfill item_id from the first item in the group (assumes 1:1 in current data).
    const hasItemGroupId = await knex.schema.hasColumn('asset_bom_lines', 'item_group_id');
    if (hasItemGroupId) {
      await knex.raw(`
        update asset_bom_lines abl
        set item_id = i.id
        from items i
        where abl.item_id is null
          and i.item_group_id = abl.item_group_id
      `);
    }

    await knex.raw('alter table asset_bom_lines drop constraint if exists asset_bom_lines_asset_id_item_group_id_uq');
    await knex.raw('drop index if exists asset_bom_lines_organization_id_item_group_id_index');

    const hasPreferred = await knex.schema.hasColumn('asset_bom_lines', 'preferred');
    if (!hasPreferred) {
      await knex.schema.alterTable('asset_bom_lines', (t) => {
        t.boolean('preferred').notNullable().defaultTo(true);
      });
    }

    const nowHasItemId = await knex.schema.hasColumn('asset_bom_lines', 'item_id');
    if (nowHasItemId) {
      await knex.raw('alter table asset_bom_lines add constraint asset_bom_lines_asset_id_item_id_unique unique (asset_id, item_id)');
      await knex.schema.alterTable('asset_bom_lines', (t) => {
        t.index(['organization_id', 'item_id']);
      });
      await knex.raw('update asset_bom_lines set preferred = true where preferred is null');
    }

    const nowHasItemGroupId = await knex.schema.hasColumn('asset_bom_lines', 'item_group_id');
    if (nowHasItemGroupId) {
      await knex.schema.alterTable('asset_bom_lines', (t) => {
        t.dropColumn('item_group_id');
      });
    }
  }

  if (hasItems) {
    const hasItemGroupId = await knex.schema.hasColumn('items', 'item_group_id');
    if (hasItemGroupId) {
      await knex.raw('drop index if exists items_organization_id_item_group_id_index');
      await knex.schema.alterTable('items', (t) => {
        t.dropColumn('item_group_id');
      });
    }
  }

  if (hasItemGroups) {
    await knex.schema.dropTableIfExists('item_groups');
  }
};

