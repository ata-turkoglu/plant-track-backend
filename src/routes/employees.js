import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';
import {
  createEmployee,
  deleteEmployee,
  findEmployeeConflict,
  getEmployeeById,
  listEmployeesByOrganization,
  updateEmployee
} from '../models/employees.js';
import { parsePaginationQuery } from '../utils/pagination.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

router.get('/organizations/:id/employees', (req, res) => {
  const organizationId = req.organizationId;
  const pagination = parsePaginationQuery(req.query, { defaultPageSize: 12, maxPageSize: 100 });
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const name = typeof req.query.name === 'string' ? req.query.name : undefined;
  const title = typeof req.query.title === 'string' ? req.query.title : undefined;
  const email = typeof req.query.email === 'string' ? req.query.email : undefined;
  const phone = typeof req.query.phone === 'string' ? req.query.phone : undefined;
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
  const sortField = typeof req.query.sortField === 'string' ? req.query.sortField : undefined;
  const sortOrder = typeof req.query.sortOrder === 'string' ? req.query.sortOrder : undefined;

  return Promise.resolve()
    .then(() =>
      listEmployeesByOrganization(organizationId, {
        q,
        name,
        title,
        email,
        phone,
        locationId,
        sortField,
        sortOrder,
        page: pagination.enabled ? pagination.page : undefined,
        pageSize: pagination.enabled ? pagination.pageSize : undefined
      })
    )
    .then((result) => {
      if (pagination.enabled) return res.status(200).json({ employees: result.rows, pagination: result.pagination });
      return res.status(200).json({ employees: result });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch employees' }));
});

const upsertSchema = z.object({
  name: z.string().min(1).max(255),
  location_id: z.number().int().positive().optional().nullable(),
  title: z.string().max(255).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  notes: z.string().max(8000).optional().nullable()
});

function getConflictResponse(conflict, payload) {
  if (!conflict) return null;
  if (payload.email && conflict.email && String(conflict.email).toLowerCase() === String(payload.email).toLowerCase()) {
    return { conflictEmail: true };
  }
  if (payload.phone && conflict.phone && String(conflict.phone) === String(payload.phone)) return { conflictPhone: true };
  return null;
}

router.post('/organizations/:id/employees', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }
  const normalized = {
    name: parsed.data.name.trim(),
    locationId: parsed.data.location_id ?? null,
    title: parsed.data.title?.trim() || null,
    email: parsed.data.email?.trim() || null,
    phone: parsed.data.phone?.trim() || null,
    notes: parsed.data.notes?.trim() || null
  };

  return Promise.resolve()
    .then(async () => {
      if (normalized.locationId) {
        const location = await db('locations')
          .where({ id: normalized.locationId, organization_id: organizationId })
          .first(['id']);
        if (!location) return { badLocation: true };
      }

      const conflict = await findEmployeeConflict(organizationId, {
        email: normalized.email ?? undefined,
        phone: normalized.phone ?? undefined
      });
      const conflictResult = getConflictResponse(conflict, normalized);
      if (conflictResult) return conflictResult;

      const employee = await db.transaction((trx) =>
        createEmployee(trx, {
          organizationId,
          locationId: normalized.locationId,
          name: normalized.name,
          title: normalized.title,
          email: normalized.email,
          phone: normalized.phone,
          notes: normalized.notes
        })
      );
      return { employee };
    })
    .then((result) => {
      if (result.badLocation) return res.status(404).json({ message: 'Location not found' });
      if (result.conflictEmail) return res.status(409).json({ message: 'Employee email already exists' });
      if (result.conflictPhone) return res.status(409).json({ message: 'Employee phone already exists' });
      return res.status(201).json({ employee: result.employee });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create employee' }));
});

router.put('/organizations/:id/employees/:employeeId', (req, res) => {
  const organizationId = req.organizationId;
  const employeeId = Number(req.params.employeeId);
  if (!Number.isFinite(employeeId)) return res.status(400).json({ message: 'Invalid employee id' });

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }
  const normalized = {
    name: parsed.data.name.trim(),
    locationId: parsed.data.location_id ?? null,
    title: parsed.data.title?.trim() || null,
    email: parsed.data.email?.trim() || null,
    phone: parsed.data.phone?.trim() || null,
    notes: parsed.data.notes?.trim() || null
  };

  return Promise.resolve()
    .then(async () => {
      const existing = await getEmployeeById(employeeId);
      if (!existing || existing.organization_id !== organizationId) return { notFoundEmployee: true };

      if (normalized.locationId) {
        const location = await db('locations')
          .where({ id: normalized.locationId, organization_id: organizationId })
          .first(['id']);
        if (!location) return { badLocation: true };
      }

      const conflict = await findEmployeeConflict(organizationId, {
        email: normalized.email ?? undefined,
        phone: normalized.phone ?? undefined,
        excludeId: employeeId
      });
      const conflictResult = getConflictResponse(conflict, normalized);
      if (conflictResult) return conflictResult;

      const employee = await db.transaction((trx) =>
        updateEmployee(trx, {
          organizationId,
          employeeId,
          locationId: normalized.locationId,
          name: normalized.name,
          title: normalized.title,
          email: normalized.email,
          phone: normalized.phone,
          notes: normalized.notes
        })
      );
      return { employee };
    })
    .then((result) => {
      if (result.notFoundEmployee) return res.status(404).json({ message: 'Employee not found' });
      if (result.badLocation) return res.status(404).json({ message: 'Location not found' });
      if (result.conflictEmail) return res.status(409).json({ message: 'Employee email already exists' });
      if (result.conflictPhone) return res.status(409).json({ message: 'Employee phone already exists' });
      if (!result.employee) return res.status(404).json({ message: 'Employee not found' });
      return res.status(200).json({ employee: result.employee });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update employee' }));
});

router.delete('/organizations/:id/employees/:employeeId', (req, res) => {
  const organizationId = req.organizationId;
  const employeeId = Number(req.params.employeeId);
  if (!Number.isFinite(employeeId)) return res.status(400).json({ message: 'Invalid employee id' });

  return Promise.resolve()
    .then(async () => {
      const existing = await getEmployeeById(employeeId);
      if (!existing || existing.organization_id !== organizationId) return { notFoundEmployee: true };

      const usedInWorkOrder = await db('maintenance_work_orders')
        .where({ organization_id: organizationId })
        .whereRaw("? = any(coalesce(assigned_employee_ids, '{}'::int[]))", [employeeId])
        .first(['id']);
      if (usedInWorkOrder) return { employeeInUse: true };

      const deleted = await db.transaction((trx) => deleteEmployee(trx, { organizationId, employeeId }));
      if (!deleted) return { notFoundEmployee: true };

      return { ok: true };
    })
    .then((result) => {
      if (result.notFoundEmployee) return res.status(404).json({ message: 'Employee not found' });
      if (result.employeeInUse) {
        return res.status(409).json({ message: 'Employee is assigned to maintenance work orders and cannot be deleted.' });
      }
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete employee' }));
});

export default router;
