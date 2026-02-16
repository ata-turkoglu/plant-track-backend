/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasFromKind = await knex.schema.hasColumn('inventory_movements', 'from_kind');
  if (!hasFromKind) {
    await knex.schema.alterTable('inventory_movements', (t) => {
      t.string('from_kind', 32).notNullable().defaultTo('UNKNOWN');
      t.string('from_ref', 255).notNullable().defaultTo('');
      t.string('to_kind', 32).notNullable().defaultTo('UNKNOWN');
      t.string('to_ref', 255).notNullable().defaultTo('');
      t.index(['organization_id', 'from_kind']);
      t.index(['organization_id', 'to_kind']);
    });
  }

  // Best-effort backfill for existing rows:
  // - IN: to=WAREHOUSE:<name>
  // - OUT: from=WAREHOUSE:<name>
  // - ADJUSTMENT: from/to=WAREHOUSE:<name>
  await knex.raw(
    `update inventory_movements m
     set to_kind = case when m.movement_type = 'IN' then 'WAREHOUSE' else m.to_kind end,
         to_ref  = case when m.movement_type = 'IN' then coalesce(w.name, '') else m.to_ref end,
         from_kind = case
           when m.movement_type in ('OUT','ADJUSTMENT') then 'WAREHOUSE'
           else m.from_kind
         end,
         from_ref = case
           when m.movement_type in ('OUT','ADJUSTMENT') then coalesce(w.name, '')
           else m.from_ref
         end
     from warehouses w
     where w.id = m.warehouse_id`
  );

  await knex.raw(
    `update inventory_movements m
     set to_kind = 'WAREHOUSE',
         to_ref = coalesce(w.name, '')
     from warehouses w
     where m.movement_type = 'ADJUSTMENT'
       and w.id = m.warehouse_id`
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasFromKind = await knex.schema.hasColumn('inventory_movements', 'from_kind');
  if (hasFromKind) {
    await knex.schema.alterTable('inventory_movements', (t) => {
      t.dropIndex(['organization_id', 'from_kind']);
      t.dropIndex(['organization_id', 'to_kind']);
      t.dropColumn('from_kind');
      t.dropColumn('from_ref');
      t.dropColumn('to_kind');
      t.dropColumn('to_ref');
    });
  }
};

