/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasAssets = await knex.schema.hasTable('assets');
  const hasNodes = await knex.schema.hasTable('nodes');
  if (!hasAssets || !hasNodes) return;

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
      a.organization_id,
      'ASSET' as node_type,
      'assets' as ref_table,
      a.id::text as ref_id,
      a.code,
      a.name,
      true as is_stocked,
      jsonb_build_object(
        'active', a.active,
        'location_id', a.location_id,
        'parent_asset_id', a.parent_asset_id,
        'asset_type_id', a.asset_type_id,
        'current_state', a.current_state
      ) as meta_json,
      now(),
      now()
    from assets a
    on conflict (organization_id, node_type, ref_table, ref_id)
    do update
      set code = excluded.code,
          name = excluded.name,
          is_stocked = excluded.is_stocked,
          meta_json = excluded.meta_json,
          updated_at = now()
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down() {
  // No-op: backfilled rows may be referenced by movement history.
};

