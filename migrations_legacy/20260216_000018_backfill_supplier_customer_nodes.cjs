/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasNodes = await knex.schema.hasTable('nodes');
  if (!hasNodes) return;

  const hasSuppliers = await knex.schema.hasTable('suppliers');
  if (hasSuppliers) {
    await knex.raw(
      `insert into nodes (organization_id, node_type, ref_table, ref_id, code, name, is_stocked, meta_json, created_at, updated_at)
       select s.organization_id, 'SUPPLIER', 'suppliers', s.id::text, s.kind, s.name, false, jsonb_build_object('kind', s.kind, 'active', s.active), now(), now()
       from suppliers s
       on conflict (organization_id, node_type, ref_table, ref_id)
       do update set
         code = excluded.code,
         name = excluded.name,
         is_stocked = excluded.is_stocked,
         meta_json = excluded.meta_json,
         updated_at = now()`
    );
  }

  const hasCustomers = await knex.schema.hasTable('customers');
  if (hasCustomers) {
    await knex.raw(
      `insert into nodes (organization_id, node_type, ref_table, ref_id, code, name, is_stocked, meta_json, created_at, updated_at)
       select c.organization_id, 'CUSTOMER', 'customers', c.id::text, null, c.name, false, jsonb_build_object('active', c.active), now(), now()
       from customers c
       on conflict (organization_id, node_type, ref_table, ref_id)
       do update set
         name = excluded.name,
         is_stocked = excluded.is_stocked,
         meta_json = excluded.meta_json,
         updated_at = now()`
    );
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasNodes = await knex.schema.hasTable('nodes');
  if (!hasNodes) return;
  await knex('nodes').where({ node_type: 'SUPPLIER', ref_table: 'suppliers' }).del();
  await knex('nodes').where({ node_type: 'CUSTOMER', ref_table: 'customers' }).del();
};
