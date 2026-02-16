/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasNodes = await knex.schema.hasTable('nodes');
  if (!hasNodes) {
    await knex.schema.createTable('nodes', (t) => {
      t.increments('id').primary();
      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      t.string('node_type', 32).notNullable();
      t.string('ref_table', 64).notNullable();
      t.string('ref_id', 64).notNullable();
      t.string('code', 64).nullable();
      t.string('name', 255).notNullable();
      t.boolean('is_stocked').notNullable().defaultTo(true);
      t.jsonb('meta_json').nullable();
      t.timestamps(true, true);

      t.unique(['organization_id', 'node_type', 'ref_table', 'ref_id']);
      t.index(['organization_id', 'node_type']);
      t.index(['ref_table', 'ref_id']);
    });
  }

  await knex.raw(
    "alter table nodes drop constraint if exists nodes_node_type_check; alter table nodes add constraint nodes_node_type_check check (node_type in ('WAREHOUSE','LOCATION','SUPPLIER','CUSTOMER','ASSET','VIRTUAL'))"
  );

  const hasFromNodeId = await knex.schema.hasColumn('inventory_movements', 'from_node_id');
  const hasToNodeId = await knex.schema.hasColumn('inventory_movements', 'to_node_id');
  const hasEventType = await knex.schema.hasColumn('inventory_movements', 'event_type');
  const hasStatus = await knex.schema.hasColumn('inventory_movements', 'status');
  const hasOccurredAt = await knex.schema.hasColumn('inventory_movements', 'occurred_at');

  await knex.schema.alterTable('inventory_movements', (t) => {
    if (!hasFromNodeId) t.integer('from_node_id').nullable().references('id').inTable('nodes');
    if (!hasToNodeId) t.integer('to_node_id').nullable().references('id').inTable('nodes');
    if (!hasEventType) t.string('event_type', 32).nullable();
    if (!hasStatus) t.string('status', 16).notNullable().defaultTo('POSTED');
    if (!hasOccurredAt) t.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('inventory_movements', (t) => {
    if (!hasFromNodeId) t.index(['from_node_id', 'item_id']);
    if (!hasToNodeId) t.index(['to_node_id', 'item_id']);
    if (!hasOccurredAt) t.index(['occurred_at']);
  });

  await knex.raw(
    `insert into nodes (organization_id, node_type, ref_table, ref_id, code, name, is_stocked, meta_json, created_at, updated_at)
     select w.organization_id, 'WAREHOUSE', 'warehouses', w.id::text, null, w.name, true, null, now(), now()
     from warehouses w
     on conflict (organization_id, node_type, ref_table, ref_id)
     do update set name = excluded.name, updated_at = now()`
  );

  await knex.raw(
    `insert into nodes (organization_id, node_type, ref_table, ref_id, code, name, is_stocked, meta_json, created_at, updated_at)
     select l.organization_id, 'LOCATION', 'locations', l.id::text, null, l.name, true, null, now(), now()
     from locations l
     on conflict (organization_id, node_type, ref_table, ref_id)
     do update set name = excluded.name, updated_at = now()`
  );

  await knex.raw(
    `insert into nodes (organization_id, node_type, ref_table, ref_id, code, name, is_stocked, meta_json, created_at, updated_at)
     select o.id, 'VIRTUAL', 'virtual', 'EXTERNAL', 'EXTERNAL', 'External', false, '{"kind":"EXTERNAL"}'::jsonb, now(), now()
     from organizations o
     on conflict (organization_id, node_type, ref_table, ref_id)
     do update set name = excluded.name, updated_at = now()`
  );

  await knex.raw(
    `insert into nodes (organization_id, node_type, ref_table, ref_id, code, name, is_stocked, meta_json, created_at, updated_at)
     select o.id, 'VIRTUAL', 'virtual', 'ADJUSTMENT', 'ADJUSTMENT', 'Adjustment', false, '{"kind":"ADJUSTMENT"}'::jsonb, now(), now()
     from organizations o
     on conflict (organization_id, node_type, ref_table, ref_id)
     do update set name = excluded.name, updated_at = now()`
  );

  await knex.raw(
    `update inventory_movements m
     set from_node_id = n.id
     from nodes n
     where m.from_node_id is null
       and m.organization_id = n.organization_id
       and n.node_type = 'WAREHOUSE'
       and n.ref_table = 'warehouses'
       and n.ref_id = m.warehouse_id::text
       and m.movement_type in ('OUT','TRANSFER','ADJUSTMENT')`
  );

  await knex.raw(
    `update inventory_movements m
     set to_node_id = n.id
     from nodes n
     where m.to_node_id is null
       and m.organization_id = n.organization_id
       and n.node_type = 'WAREHOUSE'
       and n.ref_table = 'warehouses'
       and n.ref_id = m.warehouse_id::text
       and m.movement_type in ('IN','ADJUSTMENT')`
  );

  const hasFromKind = await knex.schema.hasColumn('inventory_movements', 'from_kind');
  const hasFromRef = await knex.schema.hasColumn('inventory_movements', 'from_ref');
  if (hasFromKind && hasFromRef) {
    await knex.raw(
      `update inventory_movements m
       set from_node_id = n.id
       from locations l
       join nodes n on n.organization_id = l.organization_id
                  and n.node_type = 'LOCATION'
                  and n.ref_table = 'locations'
                  and n.ref_id = l.id::text
       where m.from_node_id is null
         and m.organization_id = l.organization_id
         and m.from_kind = 'LOCATION'
         and lower(trim(coalesce(m.from_ref,''))) = lower(trim(l.name))`
    );
  }

  const hasToKind = await knex.schema.hasColumn('inventory_movements', 'to_kind');
  const hasToRef = await knex.schema.hasColumn('inventory_movements', 'to_ref');
  if (hasToKind && hasToRef) {
    await knex.raw(
      `update inventory_movements m
       set to_node_id = n.id
       from locations l
       join nodes n on n.organization_id = l.organization_id
                  and n.node_type = 'LOCATION'
                  and n.ref_table = 'locations'
                  and n.ref_id = l.id::text
       where m.to_node_id is null
         and m.organization_id = l.organization_id
         and m.to_kind = 'LOCATION'
         and lower(trim(coalesce(m.to_ref,''))) = lower(trim(l.name))`
    );
  }

  const hasMovementGroup = await knex.schema.hasColumn('inventory_movements', 'movement_group_id');
  if (hasMovementGroup) {
    await knex.raw(
      `update inventory_movements m_out
       set to_node_id = n.id
       from inventory_movements m_in
       join nodes n on n.organization_id = m_in.organization_id
                  and n.node_type = 'WAREHOUSE'
                  and n.ref_table = 'warehouses'
                  and n.ref_id = m_in.warehouse_id::text
       where m_out.to_node_id is null
         and m_out.organization_id = m_in.organization_id
         and m_out.movement_group_id = m_in.movement_group_id
         and m_out.movement_type = 'OUT'
         and m_in.movement_type = 'IN'
         and m_out.movement_group_id is not null`
    );

    await knex.raw(
      `update inventory_movements m_in
       set from_node_id = n.id
       from inventory_movements m_out
       join nodes n on n.organization_id = m_out.organization_id
                  and n.node_type = 'WAREHOUSE'
                  and n.ref_table = 'warehouses'
                  and n.ref_id = m_out.warehouse_id::text
       where m_in.from_node_id is null
         and m_in.organization_id = m_out.organization_id
         and m_in.movement_group_id = m_out.movement_group_id
         and m_in.movement_type = 'IN'
         and m_out.movement_type = 'OUT'
         and m_in.movement_group_id is not null`
    );
  }

  await knex.raw(
    `update inventory_movements m
     set from_node_id = n.id
     from nodes n
     where m.from_node_id is null
       and m.organization_id = n.organization_id
       and n.node_type = 'VIRTUAL'
       and n.ref_table = 'virtual'
       and n.ref_id = 'EXTERNAL'
       and m.movement_type = 'IN'`
  );

  await knex.raw(
    `update inventory_movements m
     set to_node_id = n.id
     from nodes n
     where m.to_node_id is null
       and m.organization_id = n.organization_id
       and n.node_type = 'VIRTUAL'
       and n.ref_table = 'virtual'
       and n.ref_id = 'EXTERNAL'
       and m.movement_type = 'OUT'`
  );

  await knex.raw(
    `update inventory_movements m
     set from_node_id = n.id
     from nodes n
     where m.from_node_id is null
       and m.organization_id = n.organization_id
       and n.node_type = 'VIRTUAL'
       and n.ref_table = 'virtual'
       and n.ref_id = 'EXTERNAL'`
  );

  await knex.raw(
    `update inventory_movements m
     set to_node_id = n.id
     from nodes n
     where m.to_node_id is null
       and m.organization_id = n.organization_id
       and n.node_type = 'VIRTUAL'
       and n.ref_table = 'virtual'
       and n.ref_id = 'EXTERNAL'`
  );

  await knex.raw(
    `update inventory_movements m
     set to_node_id = n.id
     from nodes n
     where m.from_node_id = m.to_node_id
       and m.organization_id = n.organization_id
       and n.node_type = 'VIRTUAL'
       and n.ref_table = 'virtual'
       and n.ref_id = 'ADJUSTMENT'`
  );

  await knex('inventory_movements').whereNull('status').update({ status: 'POSTED' });
  await knex.raw("update inventory_movements set event_type = movement_type where event_type is null");

  const hasNullNodeRows = await knex('inventory_movements')
    .whereNull('from_node_id')
    .orWhereNull('to_node_id')
    .first(['id']);
  if (!hasNullNodeRows) {
    await knex.schema.alterTable('inventory_movements', (t) => {
      t.integer('from_node_id').notNullable().alter();
      t.integer('to_node_id').notNullable().alter();
    });
  }

  await knex.raw(
    `alter table inventory_movements
       drop constraint if exists inventory_movements_from_to_node_check;
     alter table inventory_movements
       add constraint inventory_movements_from_to_node_check check (from_node_id <> to_node_id)`
  );
  await knex.raw(
    `alter table inventory_movements
       drop constraint if exists inventory_movements_status_check;
     alter table inventory_movements
       add constraint inventory_movements_status_check check (status in ('DRAFT','POSTED','CANCELLED'))`
  );

  await knex.schema.alterTable('inventory_movements', (t) => {
    t.index(['occurred_at']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasFromNodeId = await knex.schema.hasColumn('inventory_movements', 'from_node_id');
  const hasToNodeId = await knex.schema.hasColumn('inventory_movements', 'to_node_id');
  const hasEventType = await knex.schema.hasColumn('inventory_movements', 'event_type');
  const hasStatus = await knex.schema.hasColumn('inventory_movements', 'status');

  await knex.raw('alter table inventory_movements drop constraint if exists inventory_movements_from_to_node_check');
  await knex.raw('alter table inventory_movements drop constraint if exists inventory_movements_status_check');

  await knex.raw('drop index if exists inventory_movements_occurred_at_index');
  await knex.schema.alterTable('inventory_movements', (t) => {
    if (hasFromNodeId) t.dropIndex(['from_node_id', 'item_id']);
    if (hasToNodeId) t.dropIndex(['to_node_id', 'item_id']);
    if (hasFromNodeId) t.dropColumn('from_node_id');
    if (hasToNodeId) t.dropColumn('to_node_id');
    if (hasEventType) t.dropColumn('event_type');
    if (hasStatus) t.dropColumn('status');
  });

  await knex.raw('alter table nodes drop constraint if exists nodes_node_type_check');
  await knex.schema.dropTableIfExists('nodes');
};
