import db from '../db/knex.js';

export async function listFirmsByOrganization(organizationId) {
  return db('firms')
    .where({ organization_id: organizationId })
    .orderBy([{ column: 'name', order: 'asc' }])
    .select([
      'id',
      'organization_id',
      'name',
      'email',
      'phone',
      'address',
      'tax_no',
      'contact_name',
      'notes',
      'active',
      'created_at',
      'updated_at'
    ]);
}

export async function getFirmById(id) {
  return db('firms')
    .where({ id })
    .first([
      'id',
      'organization_id',
      'name',
      'email',
      'phone',
      'address',
      'tax_no',
      'contact_name',
      'notes',
      'active',
      'created_at',
      'updated_at'
    ]);
}

export async function createFirm(trx, { organizationId, name, email, phone, address, taxNo, contactName, notes, active }) {
  const rows = await trx('firms')
    .insert({
      organization_id: organizationId,
      name,
      email: email ?? null,
      phone: phone ?? null,
      address: address ?? null,
      tax_no: taxNo ?? null,
      contact_name: contactName ?? null,
      notes: notes ?? null,
      active: active ?? true
    })
    .returning([
      'id',
      'organization_id',
      'name',
      'email',
      'phone',
      'address',
      'tax_no',
      'contact_name',
      'notes',
      'active',
      'created_at',
      'updated_at'
    ]);

  return rows[0];
}

export async function updateFirm(trx, { organizationId, firmId, name, email, phone, address, taxNo, contactName, notes, active }) {
  const rows = await trx('firms')
    .where({ id: firmId, organization_id: organizationId })
    .update({
      name,
      email: email ?? null,
      phone: phone ?? null,
      address: address ?? null,
      tax_no: taxNo ?? null,
      contact_name: contactName ?? null,
      notes: notes ?? null,
      active: active ?? true,
      updated_at: trx.fn.now()
    })
    .returning([
      'id',
      'organization_id',
      'name',
      'email',
      'phone',
      'address',
      'tax_no',
      'contact_name',
      'notes',
      'active',
      'created_at',
      'updated_at'
    ]);

  return rows[0] ?? null;
}

export async function deleteFirm(trx, { organizationId, firmId }) {
  const rows = await trx('firms').where({ id: firmId, organization_id: organizationId }).del().returning(['id']);
  return rows[0] ?? null;
}

export async function findFirmConflict(organizationId, { name, email, phone, excludeId } = {}) {
  const query = db('firms').where({ organization_id: organizationId });
  if (excludeId) query.whereNot({ id: excludeId });

  const checks = [];
  if (name) checks.push({ field: 'name', value: name });
  if (email) checks.push({ field: 'email', value: email });
  if (phone) checks.push({ field: 'phone', value: phone });
  if (checks.length === 0) return null;

  query.andWhere((builder) => {
    for (const check of checks) {
      if (check.field === 'phone') {
        builder.orWhere('phone', check.value);
        continue;
      }
      builder.orWhereRaw(`lower(${check.field}) = lower(?)`, [check.value]);
    }
  });

  return query.first(['id', 'name', 'email', 'phone']);
}

