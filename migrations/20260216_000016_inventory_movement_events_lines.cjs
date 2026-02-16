/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasNodes = await knex.schema.hasTable('nodes');
  if (!hasNodes) {
    throw new Error('nodes table is required before inventory_movement_events/lines migration');
  }

  const hasEvents = await knex.schema.hasTable('inventory_movement_events');
  if (!hasEvents) {
    await knex.schema.createTable('inventory_movement_events', (t) => {
      t.increments('id').primary();
      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      t.string('event_type', 32).notNullable();
      t.string('status', 16).notNullable().defaultTo('POSTED');
      t.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.string('reference_type', 64).nullable();
      t.string('reference_id', 64).nullable();
      t.text('note').nullable();
      t.integer('created_by_user_id').nullable().references('id').inTable('users');
      t.integer('legacy_movement_id').nullable();
      t.timestamps(true, true);

      t.unique(['legacy_movement_id']);
      t.index(['organization_id', 'occurred_at']);
      t.index(['event_type', 'occurred_at']);
    });
  }

  await knex.raw(
    `alter table inventory_movement_events
       drop constraint if exists inventory_movement_events_status_check;
     alter table inventory_movement_events
       add constraint inventory_movement_events_status_check check (status in ('DRAFT','POSTED','CANCELLED'))`
  );

  const hasLines = await knex.schema.hasTable('inventory_movement_lines');
  if (!hasLines) {
    await knex.schema.createTable('inventory_movement_lines', (t) => {
      t.increments('id').primary();
      t
        .integer('event_id')
        .notNullable()
        .references('id')
        .inTable('inventory_movement_events')
        .onDelete('CASCADE');
      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      t.integer('line_no').notNullable().defaultTo(1);
      t
        .integer('item_id')
        .notNullable()
        .references('id')
        .inTable('items');
      t
        .integer('unit_id')
        .notNullable()
        .references('id')
        .inTable('units');
      t
        .integer('from_node_id')
        .notNullable()
        .references('id')
        .inTable('nodes');
      t
        .integer('to_node_id')
        .notNullable()
        .references('id')
        .inTable('nodes');
      t.decimal('quantity', 18, 3).notNullable();
      t.integer('legacy_movement_id').nullable();
      t.timestamps(true, true);

      t.unique(['legacy_movement_id']);
      t.unique(['event_id', 'line_no']);
      t.index(['to_node_id', 'item_id']);
      t.index(['from_node_id', 'item_id']);
      t.index(['event_id']);
      t.index(['organization_id', 'item_id']);
    });
  }

  await knex.raw(
    `alter table inventory_movement_lines
       drop constraint if exists inventory_movement_lines_qty_check;
     alter table inventory_movement_lines
       add constraint inventory_movement_lines_qty_check check (quantity > 0)`
  );
  await knex.raw(
    `alter table inventory_movement_lines
       drop constraint if exists inventory_movement_lines_from_to_check;
     alter table inventory_movement_lines
       add constraint inventory_movement_lines_from_to_check check (from_node_id <> to_node_id)`
  );

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
     do nothing`
  );

  await knex.raw(
    `insert into inventory_movement_events
      (organization_id, event_type, status, occurred_at, reference_type, reference_id, note, created_by_user_id, legacy_movement_id, created_at, updated_at)
     select
       m.organization_id,
       coalesce(nullif(m.event_type, ''), m.movement_type, 'ADJUSTMENT') as event_type,
       coalesce(nullif(m.status, ''), 'POSTED') as status,
       coalesce(m.occurred_at, m.created_at, now()) as occurred_at,
       m.reference_type,
       m.reference_id,
       m.note,
       m.created_by_user_id,
       m.id,
       coalesce(m.created_at, now()),
       now()
     from inventory_movements m
     where not exists (
       select 1
       from inventory_movement_events e
       where e.legacy_movement_id = m.id
     )`
  );

  await knex.raw(
    `insert into inventory_movement_lines
      (event_id, organization_id, line_no, item_id, unit_id, from_node_id, to_node_id, quantity, legacy_movement_id, created_at, updated_at)
     select
       e.id,
       m.organization_id,
       1,
       m.item_id,
       i.unit_id,
       coalesce(
         m.from_node_id,
         n_from.id,
         n_ext.id
       ) as from_node_id,
       coalesce(
         m.to_node_id,
         n_to.id,
         n_ext.id
       ) as to_node_id,
       m.quantity,
       m.id,
       coalesce(m.created_at, now()),
       now()
     from inventory_movements m
     join inventory_movement_events e
       on e.legacy_movement_id = m.id
     join items i
       on i.id = m.item_id
      and i.organization_id = m.organization_id
     left join nodes n_from
       on n_from.organization_id = m.organization_id
      and n_from.node_type = 'WAREHOUSE'
      and n_from.ref_table = 'warehouses'
      and n_from.ref_id = m.warehouse_id::text
      and m.movement_type in ('OUT','TRANSFER','ADJUSTMENT')
     left join nodes n_to
       on n_to.organization_id = m.organization_id
      and n_to.node_type = 'WAREHOUSE'
      and n_to.ref_table = 'warehouses'
      and n_to.ref_id = m.warehouse_id::text
      and m.movement_type in ('IN','ADJUSTMENT')
     left join nodes n_ext
       on n_ext.organization_id = m.organization_id
      and n_ext.node_type = 'VIRTUAL'
      and n_ext.ref_table = 'virtual'
      and n_ext.ref_id = 'EXTERNAL'
     where not exists (
       select 1
       from inventory_movement_lines l
       where l.legacy_movement_id = m.id
     )`
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('alter table inventory_movement_lines drop constraint if exists inventory_movement_lines_from_to_check');
  await knex.raw('alter table inventory_movement_lines drop constraint if exists inventory_movement_lines_qty_check');
  await knex.raw('alter table inventory_movement_events drop constraint if exists inventory_movement_events_status_check');
  await knex.schema.dropTableIfExists('inventory_movement_lines');
  await knex.schema.dropTableIfExists('inventory_movement_events');
};
