/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // Now that more units (e.g. ton) may exist, re-sync items.unit_id from legacy items.uom where possible.
  await knex.raw(
    `update items i
     set unit_id = u.id,
         updated_at = now()
     from units u
     where u.organization_id = i.organization_id
       and lower(u.code) = lower(i.uom)
       and (i.unit_id is distinct from u.id)`
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down() {
  // no-op
};

