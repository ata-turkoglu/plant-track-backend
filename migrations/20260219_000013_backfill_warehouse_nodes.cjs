/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasWarehouses = await knex.schema.hasTable('warehouses');
  const hasNodes = await knex.schema.hasTable('nodes');
  if (!hasWarehouses || !hasNodes) return;

  await knex.raw(`
    insert into nodes (
      organization_id,
      node_type,
      ref_table,
      ref_id,
      code,
      name,
      is_stocked,
      meta_json,
      created_at,
      updated_at
    )
    select
      w.organization_id,
      'WAREHOUSE' as node_type,
      'warehouses' as ref_table,
      w.id::text as ref_id,
      null as code,
      w.name,
      true as is_stocked,
      jsonb_build_object(
        'location_id', w.location_id,
        'warehouse_type_id', w.warehouse_type_id
      ) as meta_json,
      now(),
      now()
    from warehouses w
    on conflict (organization_id, node_type, ref_table, ref_id)
    do update
      set name = excluded.name,
          is_stocked = excluded.is_stocked,
          meta_json = excluded.meta_json,
          updated_at = now()
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down() {
  // No-op: backfilled rows may be referenced by movement history.
};
