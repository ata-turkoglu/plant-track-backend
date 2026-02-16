/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasEvents = await knex.schema.hasTable('inventory_movement_events');
  if (hasEvents) {
    await knex('inventory_movement_events')
      .whereIn('event_type', ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT'])
      .update({ event_type: 'MOVE', updated_at: knex.fn.now() });
  }

  const hasLegacy = await knex.schema.hasTable('inventory_movements');
  if (hasLegacy) {
    await knex.schema.dropTable('inventory_movements');
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  // Legacy table drop is intentionally irreversible in this migration.
};
