/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasEvents = await knex.schema.hasTable('inventory_movement_events');
  if (hasEvents) {
    const hasLegacyCol = await knex.schema.hasColumn('inventory_movement_events', 'legacy_movement_id');
    if (hasLegacyCol) {
      await knex.schema.alterTable('inventory_movement_events', (t) => {
        t.dropUnique(['legacy_movement_id']);
        t.dropColumn('legacy_movement_id');
      });
    }
  }

  const hasLines = await knex.schema.hasTable('inventory_movement_lines');
  if (hasLines) {
    const hasLegacyCol = await knex.schema.hasColumn('inventory_movement_lines', 'legacy_movement_id');
    if (hasLegacyCol) {
      await knex.schema.alterTable('inventory_movement_lines', (t) => {
        t.dropUnique(['legacy_movement_id']);
        t.dropColumn('legacy_movement_id');
      });
    }
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasEvents = await knex.schema.hasTable('inventory_movement_events');
  if (hasEvents) {
    const hasLegacyCol = await knex.schema.hasColumn('inventory_movement_events', 'legacy_movement_id');
    if (!hasLegacyCol) {
      await knex.schema.alterTable('inventory_movement_events', (t) => {
        t.integer('legacy_movement_id').nullable();
        t.unique(['legacy_movement_id']);
      });
    }
  }

  const hasLines = await knex.schema.hasTable('inventory_movement_lines');
  if (hasLines) {
    const hasLegacyCol = await knex.schema.hasColumn('inventory_movement_lines', 'legacy_movement_id');
    if (!hasLegacyCol) {
      await knex.schema.alterTable('inventory_movement_lines', (t) => {
        t.integer('legacy_movement_id').nullable();
        t.unique(['legacy_movement_id']);
      });
    }
  }
};
