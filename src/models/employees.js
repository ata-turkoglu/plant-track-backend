import db from '../db/knex.js';
import { buildPaginationMeta } from '../utils/pagination.js';

const EMPLOYEE_COLUMNS = [
  'e.id',
  'e.organization_id',
  'e.location_id',
  db.raw('l.name as location_name'),
  'e.name',
  'e.title',
  'e.email',
  'e.phone',
  'e.notes',
  'e.created_at',
  'e.updated_at'
];

function baseEmployeeQuery(connection = db) {
  return connection('employees as e').leftJoin({ l: 'locations' }, function joinLocation() {
    this.on('l.id', '=', 'e.location_id').andOn('l.organization_id', '=', 'e.organization_id');
  });
}

export async function listEmployeesByOrganization(
  organizationId,
  { q, name, title, email, phone, locationId, sortField, sortOrder, page, pageSize } = {}
) {
  const query = baseEmployeeQuery(db)
    .where({ 'e.organization_id': organizationId })
    .orderBy(resolveEmployeeOrder(sortField, sortOrder))
    .select(EMPLOYEE_COLUMNS);

  const globalText = normalizeSearchText(q);
  if (globalText) {
    query.andWhere((builder) =>
      builder
        .whereRaw('e.name ilike ?', [`%${globalText}%`])
        .orWhereRaw('coalesce(e.title, \'\') ilike ?', [`%${globalText}%`])
        .orWhereRaw('coalesce(e.email, \'\') ilike ?', [`%${globalText}%`])
        .orWhereRaw('coalesce(e.phone, \'\') ilike ?', [`%${globalText}%`])
        .orWhereRaw('coalesce(l.name, \'\') ilike ?', [`%${globalText}%`])
    );
  }

  const nameText = normalizeSearchText(name);
  if (nameText) query.andWhereRaw('e.name ilike ?', [`%${nameText}%`]);

  const titleText = normalizeSearchText(title);
  if (titleText) query.andWhereRaw('coalesce(e.title, \'\') ilike ?', [`%${titleText}%`]);

  const emailText = normalizeSearchText(email);
  if (emailText) query.andWhereRaw('coalesce(e.email, \'\') ilike ?', [`%${emailText}%`]);

  const phoneText = normalizeSearchText(phone);
  if (phoneText) query.andWhereRaw('coalesce(e.phone, \'\') ilike ?', [`%${phoneText}%`]);

  const numericLocationId = Number(locationId);
  if (Number.isFinite(numericLocationId) && numericLocationId > 0) {
    query.andWhere('e.location_id', numericLocationId);
  }

  if (!Number.isFinite(page) || !Number.isFinite(pageSize)) return query;

  const [{ count }] = await query.clone().clearSelect().clearOrder().count({ count: 'e.id' });
  const rows = await query.clone().limit(pageSize).offset((page - 1) * pageSize);
  return { rows, pagination: buildPaginationMeta(count, page, pageSize) };
}

export async function getEmployeeById(id, connection = db) {
  return baseEmployeeQuery(connection).where({ 'e.id': id }).first(EMPLOYEE_COLUMNS);
}

export async function createEmployee(trx, { organizationId, locationId, name, title, email, phone, notes }) {
  const rows = await trx('employees')
    .insert({
      organization_id: organizationId,
      location_id: locationId ?? null,
      name,
      title: title ?? null,
      email: email ?? null,
      phone: phone ?? null,
      notes: notes ?? null
    })
    .returning(['id']);

  return getEmployeeById(rows[0].id, trx);
}

export async function updateEmployee(trx, { organizationId, employeeId, locationId, name, title, email, phone, notes }) {
  const rows = await trx('employees')
    .where({ id: employeeId, organization_id: organizationId })
    .update({
      location_id: locationId ?? null,
      name,
      title: title ?? null,
      email: email ?? null,
      phone: phone ?? null,
      notes: notes ?? null,
      updated_at: trx.fn.now()
    })
    .returning(['id']);

  if (!rows[0]?.id) return null;
  return getEmployeeById(rows[0].id, trx);
}

export async function deleteEmployee(trx, { organizationId, employeeId }) {
  const rows = await trx('employees').where({ id: employeeId, organization_id: organizationId }).del().returning(['id']);
  return rows[0] ?? null;
}

export async function findEmployeeConflict(organizationId, { email, phone, excludeId } = {}) {
  const query = db('employees').where({ organization_id: organizationId });
  if (excludeId) query.whereNot({ id: excludeId });

  const checks = [];
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

  return query.first(['id', 'email', 'phone']);
}

function normalizeSearchText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function resolveEmployeeOrder(sortField, sortOrder) {
  const direction = String(sortOrder ?? '').toLowerCase() === 'desc' ? 'desc' : 'asc';
  const columnMap = {
    name: 'e.name',
    title: 'e.title',
    email: 'e.email',
    phone: 'e.phone',
    location: 'l.name',
    location_id: 'l.name'
  };
  const column = columnMap[sortField] ?? 'e.name';

  return [
    { column, order: direction },
    { column: 'e.id', order: direction }
  ];
}
