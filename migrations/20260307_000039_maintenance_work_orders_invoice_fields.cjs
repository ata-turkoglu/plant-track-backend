/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_work_orders');
  if (!hasTable) return;

  const hasInvoiceNo = await knex.schema.hasColumn('maintenance_work_orders', 'invoice_no');
  if (!hasInvoiceNo) {
    await knex.schema.alterTable('maintenance_work_orders', (t) => {
      t.string('invoice_no', 128).nullable();
    });
  }

  const hasInvoiceAmount = await knex.schema.hasColumn('maintenance_work_orders', 'invoice_amount');
  if (!hasInvoiceAmount) {
    await knex.schema.alterTable('maintenance_work_orders', (t) => {
      t.decimal('invoice_amount', 14, 2).nullable();
    });
  }

  await knex.raw(
    'alter table maintenance_work_orders drop constraint if exists maintenance_work_orders_invoice_amount_check'
  );
  await knex.raw(
    'alter table maintenance_work_orders add constraint maintenance_work_orders_invoice_amount_check check (invoice_amount is null or invoice_amount >= 0)'
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('maintenance_work_orders');
  if (!hasTable) return;

  await knex.raw(
    'alter table maintenance_work_orders drop constraint if exists maintenance_work_orders_invoice_amount_check'
  );

  const hasInvoiceAmount = await knex.schema.hasColumn('maintenance_work_orders', 'invoice_amount');
  const hasInvoiceNo = await knex.schema.hasColumn('maintenance_work_orders', 'invoice_no');

  if (hasInvoiceAmount || hasInvoiceNo) {
    await knex.schema.alterTable('maintenance_work_orders', (t) => {
      if (hasInvoiceAmount) t.dropColumn('invoice_amount');
      if (hasInvoiceNo) t.dropColumn('invoice_no');
    });
  }
};
