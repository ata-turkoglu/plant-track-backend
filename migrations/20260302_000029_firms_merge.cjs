/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasFirms = await knex.schema.hasTable('firms');
  const hasSuppliers = await knex.schema.hasTable('suppliers');
  const hasCustomers = await knex.schema.hasTable('customers');

  if (hasFirms && !hasSuppliers && !hasCustomers) return;

  if (!hasFirms) {
    await knex.schema.createTable('firms', (t) => {
      t.increments('id').primary();

      t
        .integer('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      t.string('name', 255).notNullable();
      t.boolean('active').notNullable().defaultTo(true);

      t.string('email', 255).nullable();
      t.string('phone', 64).nullable();
      t.text('address').nullable();
      t.string('tax_no', 64).nullable();
      t.string('contact_name', 255).nullable();
      t.text('notes').nullable();

      t.timestamps(true, true);

      t.unique(['organization_id', 'name']);
      t.index(['organization_id']);
      t.index(['organization_id', 'active']);
    });

    await knex.raw("create unique index firms_org_email_uq on firms (organization_id, lower(email)) where email is not null");
    await knex.raw('create unique index firms_org_phone_uq on firms (organization_id, phone) where phone is not null');
  }

  if (hasSuppliers) {
    await knex.raw(
      `
      insert into firms (organization_id, name, active, email, phone, address, tax_no, contact_name, notes, created_at, updated_at)
      select organization_id, name, active, email, phone, address, tax_no, contact_name, notes, created_at, updated_at
      from suppliers
      on conflict (organization_id, name) do update set
        active = firms.active or excluded.active,
        email = coalesce(firms.email, excluded.email),
        phone = coalesce(firms.phone, excluded.phone),
        address = coalesce(firms.address, excluded.address),
        tax_no = coalesce(firms.tax_no, excluded.tax_no),
        contact_name = coalesce(firms.contact_name, excluded.contact_name),
        notes = coalesce(firms.notes, excluded.notes),
        updated_at = greatest(firms.updated_at, excluded.updated_at)
      `
    );
  }

  if (hasCustomers) {
    await knex.raw(
      `
      insert into firms (organization_id, name, active, email, phone, address, tax_no, contact_name, notes, created_at, updated_at)
      select organization_id, name, active, email, phone, address, tax_no, contact_name, notes, created_at, updated_at
      from customers
      on conflict (organization_id, name) do update set
        active = firms.active or excluded.active,
        email = coalesce(firms.email, excluded.email),
        phone = coalesce(firms.phone, excluded.phone),
        address = coalesce(firms.address, excluded.address),
        tax_no = coalesce(firms.tax_no, excluded.tax_no),
        contact_name = coalesce(firms.contact_name, excluded.contact_name),
        notes = coalesce(firms.notes, excluded.notes),
        updated_at = greatest(firms.updated_at, excluded.updated_at)
      `
    );
  }

  const hasNodes = await knex.schema.hasTable('nodes');
  const hasMovementLines = await knex.schema.hasTable('inventory_movement_lines');

  if (hasNodes) {
    await knex.raw('alter table nodes drop constraint if exists nodes_node_type_check');
    await knex.raw(
      "alter table nodes add constraint nodes_node_type_check check (node_type in ('WAREHOUSE','LOCATION','SUPPLIER','CUSTOMER','FIRM','ASSET'))"
    );
  }

  const firmNodeParts = [];
  if (hasSuppliers) {
    firmNodeParts.push(`
      select
        n.id as node_id,
        n.organization_id as organization_id,
        f.id as firm_id,
        f.name as firm_name
      from nodes n
      join suppliers s
        on n.ref_table = 'suppliers'
       and n.ref_id = s.id::text
       and n.organization_id = s.organization_id
      join firms f
        on f.organization_id = s.organization_id
       and f.name = s.name
      where n.node_type = 'SUPPLIER'
    `);
  }
  if (hasCustomers) {
    firmNodeParts.push(`
      select
        n.id as node_id,
        n.organization_id as organization_id,
        f.id as firm_id,
        f.name as firm_name
      from nodes n
      join customers c
        on n.ref_table = 'customers'
       and n.ref_id = c.id::text
       and n.organization_id = c.organization_id
      join firms f
        on f.organization_id = c.organization_id
       and f.name = c.name
      where n.node_type = 'CUSTOMER'
    `);
  }

  const firmNodesSql = firmNodeParts.filter(Boolean).join('\n union all \n');

  if (hasNodes && firmNodesSql.trim().length > 0) {
    if (hasMovementLines) {
      await knex.raw(
        `
        with firm_nodes as (
          ${firmNodesSql}
        ),
        canonical as (
          select
            organization_id,
            firm_id,
            min(node_id) as canonical_node_id
          from firm_nodes
          group by organization_id, firm_id
        ),
        node_map as (
          select
            fn.organization_id,
            fn.firm_id,
            fn.firm_name,
            fn.node_id,
            c.canonical_node_id
          from firm_nodes fn
          join canonical c
            on c.organization_id = fn.organization_id
           and c.firm_id = fn.firm_id
        )
        update inventory_movement_lines l
        set from_node_id = nm.canonical_node_id
        from node_map nm
        where l.organization_id = nm.organization_id
          and l.from_node_id = nm.node_id
          and nm.node_id <> nm.canonical_node_id
        `
      );

      await knex.raw(
        `
        with firm_nodes as (
          ${firmNodesSql}
        ),
        canonical as (
          select
            organization_id,
            firm_id,
            min(node_id) as canonical_node_id
          from firm_nodes
          group by organization_id, firm_id
        ),
        node_map as (
          select
            fn.organization_id,
            fn.firm_id,
            fn.firm_name,
            fn.node_id,
            c.canonical_node_id
          from firm_nodes fn
          join canonical c
            on c.organization_id = fn.organization_id
           and c.firm_id = fn.firm_id
        )
        update inventory_movement_lines l
        set to_node_id = nm.canonical_node_id
        from node_map nm
        where l.organization_id = nm.organization_id
          and l.to_node_id = nm.node_id
          and nm.node_id <> nm.canonical_node_id
        `
      );
    }

    await knex.raw(
      `
      with firm_nodes as (
        ${firmNodesSql}
      ),
      canonical as (
        select
          organization_id,
          firm_id,
          min(node_id) as canonical_node_id
        from firm_nodes
        group by organization_id, firm_id
      ),
      node_map as (
        select
          fn.organization_id,
          fn.firm_id,
          fn.firm_name,
          fn.node_id,
          c.canonical_node_id
        from firm_nodes fn
        join canonical c
          on c.organization_id = fn.organization_id
         and c.firm_id = fn.firm_id
      )
      update nodes n
      set
        node_type = 'FIRM',
        ref_table = 'firms',
        ref_id = nm.firm_id::text,
        name = nm.firm_name
      from node_map nm
      where n.id = nm.canonical_node_id
      `
    );

    await knex.raw(
      `
      with firm_nodes as (
        ${firmNodesSql}
      ),
      canonical as (
        select
          organization_id,
          firm_id,
          min(node_id) as canonical_node_id
        from firm_nodes
        group by organization_id, firm_id
      ),
      node_map as (
        select
          fn.node_id,
          c.canonical_node_id
        from firm_nodes fn
        join canonical c
          on c.organization_id = fn.organization_id
         and c.firm_id = fn.firm_id
      )
      delete from nodes n
      using node_map nm
      where n.id = nm.node_id
        and nm.node_id <> nm.canonical_node_id
      `
    );
  }

  if (hasSuppliers) {
    await knex.schema.dropTableIfExists('suppliers');
  }
  if (hasCustomers) {
    await knex.schema.dropTableIfExists('customers');
  }

  if (hasNodes) {
    await knex.raw('alter table nodes drop constraint if exists nodes_node_type_check');
    await knex.raw(
      "alter table nodes add constraint nodes_node_type_check check (node_type in ('WAREHOUSE','LOCATION','FIRM','ASSET'))"
    );
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down() {
  return;
};
