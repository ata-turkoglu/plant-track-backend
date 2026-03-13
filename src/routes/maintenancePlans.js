import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';
import {
  createRuntimeMaintenancePlan,
  getMaintenancePlanById,
  listMaintenancePlansByOrganization,
  setMaintenancePlanActive
} from '../models/maintenancePlans.js';
import { parsePaginationQuery } from '../utils/pagination.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

const createRuntimePlanSchema = z.object({
  asset_id: z.number().int().positive(),
  title: z.string().trim().min(1).max(255),
  note: z.string().max(8000).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
  runtime_interval: z.number().positive(),
  first_due_runtime: z.number().nonnegative().optional(),
  assigned_firm_id: z.number().int().positive().optional().nullable(),
  assigned_employee_ids: z.array(z.number().int().positive()).optional()
});

const setActiveSchema = z.object({
  active: z.boolean()
});

function normalizeAssignedEmployeeIds(values) {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  for (const value of values) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    unique.add(Math.trunc(numeric));
  }
  return Array.from(unique);
}

router.get('/organizations/:id/maintenance-plans', (req, res) => {
  const organizationId = req.organizationId;
  const pagination = parsePaginationQuery(req.query, { defaultPageSize: 20, maxPageSize: 100 });

  const assetId = typeof req.query.assetId === 'string' ? req.query.assetId : undefined;
  const activeRaw = typeof req.query.active === 'string' ? req.query.active.trim().toLowerCase() : undefined;
  const active = activeRaw === 'true' ? true : activeRaw === 'false' ? false : undefined;

  return Promise.resolve()
    .then(() =>
      listMaintenancePlansByOrganization(organizationId, {
        assetId,
        active,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
    )
    .then((result) => res.status(200).json({ plans: result.rows, pagination: result.pagination }))
    .catch(() => res.status(500).json({ message: 'Failed to fetch maintenance plans' }));
});

router.post('/organizations/:id/maintenance-plans', (req, res) => {
  const organizationId = req.organizationId;
  const createdByUserId = req.user?.id ?? null;
  const parsed = createRuntimePlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  const assetId = Number(parsed.data.asset_id);
  const title = parsed.data.title.trim();
  const note = parsed.data.note?.trim() || null;
  const runtimeInterval = Math.round(Number(parsed.data.runtime_interval) * 1000) / 1000;
  const assignedFirmId = parsed.data.assigned_firm_id ?? null;
  const assignedEmployeeIds = normalizeAssignedEmployeeIds(parsed.data.assigned_employee_ids ?? []);

  return Promise.resolve()
    .then(async () => {
      const asset = await db('assets')
        .where({ id: assetId, organization_id: organizationId })
        .first(['id', 'runtime_meter_value', 'runtime_meter_unit']);
      if (!asset) return { notFoundAsset: true };

      const currentRuntime = Number(asset.runtime_meter_value ?? 0);
      const firstDueRuntimeRaw = parsed.data.first_due_runtime;
      const nextDueRuntime = Number.isFinite(Number(firstDueRuntimeRaw))
        ? Math.round(Number(firstDueRuntimeRaw) * 1000) / 1000
        : Math.round((currentRuntime + runtimeInterval) * 1000) / 1000;

      if (!(nextDueRuntime > currentRuntime)) {
        return { invalidFirstDueRuntime: true };
      }

      if (assignedFirmId) {
        const firm = await db('firms').where({ id: assignedFirmId, organization_id: organizationId }).first(['id']);
        if (!firm) return { notFoundFirm: true };
      }

      if (assignedEmployeeIds.length > 0) {
        const employees = await db('employees')
          .where({ organization_id: organizationId })
          .whereIn('id', assignedEmployeeIds)
          .select(['id']);
        if (employees.length !== assignedEmployeeIds.length) return { invalidEmployees: true };
      }

      const createdPlanId = await db.transaction(async (trx) => {
        const inserted = await createRuntimeMaintenancePlan(trx, {
          organizationId,
          assetId,
          title,
          note,
          priority: parsed.data.priority ?? 'MEDIUM',
          runtimeInterval,
          runtimeUnit: asset.runtime_meter_unit,
          nextDueRuntime,
          assignedFirmId,
          assignedEmployeeIds,
          createdByUserId
        });
        return inserted?.id ?? null;
      });

      if (!createdPlanId) return { failedCreate: true };
      const created = await getMaintenancePlanById(organizationId, Number(createdPlanId));
      if (!created) return { failedCreate: true };
      return { plan: created };
    })
    .then((result) => {
      if (result.notFoundAsset) return res.status(404).json({ message: 'Asset not found' });
      if (result.notFoundFirm) return res.status(404).json({ message: 'Assigned firm not found' });
      if (result.invalidEmployees) return res.status(400).json({ message: 'Assigned employees are invalid' });
      if (result.invalidFirstDueRuntime) {
        return res.status(400).json({ message: 'first_due_runtime must be greater than current runtime value' });
      }
      if (result.failedCreate) return res.status(500).json({ message: 'Failed to create maintenance plan' });
      return res.status(201).json({ plan: result.plan });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create maintenance plan' }));
});

router.patch('/organizations/:id/maintenance-plans/:planId', (req, res) => {
  const organizationId = req.organizationId;
  const planId = Number(req.params.planId);
  if (!Number.isFinite(planId)) return res.status(400).json({ message: 'Invalid plan id' });

  const parsed = setActiveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      const updatedPlanId = await db.transaction(async (trx) => {
        const updated = await setMaintenancePlanActive(trx, { organizationId, planId, active: parsed.data.active });
        return updated?.id ?? null;
      });
      if (!updatedPlanId) return null;
      return getMaintenancePlanById(organizationId, Number(updatedPlanId));
    })
    .then((plan) => {
      if (!plan) return res.status(404).json({ message: 'Maintenance plan not found' });
      return res.status(200).json({ plan });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update maintenance plan' }));
});

export default router;
