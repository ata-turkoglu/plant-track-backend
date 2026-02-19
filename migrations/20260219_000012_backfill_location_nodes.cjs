/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasLocations = await knex.schema.hasTable('locations');
  const hasNodes = await knex.schema.hasTable('nodes');
  if (!hasLocations || !hasNodes) return;

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
      l.organization_id,
      'LOCATION' as node_type,
      'locations' as ref_table,
      l.id::text as ref_id,
      null as code,
      l.name,
      true as is_stocked,
      jsonb_build_object('parent_id', l.parent_id) as meta_json,
      now(),
      now()
    from locations l
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
