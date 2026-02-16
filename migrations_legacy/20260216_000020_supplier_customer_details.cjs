/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasSuppliers = await knex.schema.hasTable('suppliers');
  if (hasSuppliers) {
    const cols = {
      email: await knex.schema.hasColumn('suppliers', 'email'),
      phone: await knex.schema.hasColumn('suppliers', 'phone'),
      address: await knex.schema.hasColumn('suppliers', 'address'),
      tax_no: await knex.schema.hasColumn('suppliers', 'tax_no'),
      contact_name: await knex.schema.hasColumn('suppliers', 'contact_name'),
      notes: await knex.schema.hasColumn('suppliers', 'notes')
    };

    await knex.schema.alterTable('suppliers', (t) => {
      if (!cols.email) t.string('email', 255).nullable();
      if (!cols.phone) t.string('phone', 64).nullable();
      if (!cols.address) t.text('address').nullable();
      if (!cols.tax_no) t.string('tax_no', 64).nullable();
      if (!cols.contact_name) t.string('contact_name', 255).nullable();
      if (!cols.notes) t.text('notes').nullable();
    });

    await knex.raw(
      'create unique index if not exists suppliers_org_email_uq on suppliers (organization_id, lower(email))'
    );
    await knex.raw('create unique index if not exists suppliers_org_phone_uq on suppliers (organization_id, phone)');
  }

  const hasCustomers = await knex.schema.hasTable('customers');
  if (hasCustomers) {
    const cols = {
      email: await knex.schema.hasColumn('customers', 'email'),
      phone: await knex.schema.hasColumn('customers', 'phone'),
      address: await knex.schema.hasColumn('customers', 'address'),
      tax_no: await knex.schema.hasColumn('customers', 'tax_no'),
      contact_name: await knex.schema.hasColumn('customers', 'contact_name'),
      notes: await knex.schema.hasColumn('customers', 'notes')
    };

    await knex.schema.alterTable('customers', (t) => {
      if (!cols.email) t.string('email', 255).nullable();
      if (!cols.phone) t.string('phone', 64).nullable();
      if (!cols.address) t.text('address').nullable();
      if (!cols.tax_no) t.string('tax_no', 64).nullable();
      if (!cols.contact_name) t.string('contact_name', 255).nullable();
      if (!cols.notes) t.text('notes').nullable();
    });

    await knex.raw(
      'create unique index if not exists customers_org_email_uq on customers (organization_id, lower(email))'
    );
    await knex.raw('create unique index if not exists customers_org_phone_uq on customers (organization_id, phone)');
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const hasSuppliers = await knex.schema.hasTable('suppliers');
  if (hasSuppliers) {
    await knex.raw('drop index if exists suppliers_org_email_uq');
    await knex.raw('drop index if exists suppliers_org_phone_uq');

    const cols = {
      email: await knex.schema.hasColumn('suppliers', 'email'),
      phone: await knex.schema.hasColumn('suppliers', 'phone'),
      address: await knex.schema.hasColumn('suppliers', 'address'),
      tax_no: await knex.schema.hasColumn('suppliers', 'tax_no'),
      contact_name: await knex.schema.hasColumn('suppliers', 'contact_name'),
      notes: await knex.schema.hasColumn('suppliers', 'notes')
    };
    await knex.schema.alterTable('suppliers', (t) => {
      if (cols.email) t.dropColumn('email');
      if (cols.phone) t.dropColumn('phone');
      if (cols.address) t.dropColumn('address');
      if (cols.tax_no) t.dropColumn('tax_no');
      if (cols.contact_name) t.dropColumn('contact_name');
      if (cols.notes) t.dropColumn('notes');
    });
  }

  const hasCustomers = await knex.schema.hasTable('customers');
  if (hasCustomers) {
    await knex.raw('drop index if exists customers_org_email_uq');
    await knex.raw('drop index if exists customers_org_phone_uq');

    const cols = {
      email: await knex.schema.hasColumn('customers', 'email'),
      phone: await knex.schema.hasColumn('customers', 'phone'),
      address: await knex.schema.hasColumn('customers', 'address'),
      tax_no: await knex.schema.hasColumn('customers', 'tax_no'),
      contact_name: await knex.schema.hasColumn('customers', 'contact_name'),
      notes: await knex.schema.hasColumn('customers', 'notes')
    };
    await knex.schema.alterTable('customers', (t) => {
      if (cols.email) t.dropColumn('email');
      if (cols.phone) t.dropColumn('phone');
      if (cols.address) t.dropColumn('address');
      if (cols.tax_no) t.dropColumn('tax_no');
      if (cols.contact_name) t.dropColumn('contact_name');
      if (cols.notes) t.dropColumn('notes');
    });
  }
};
