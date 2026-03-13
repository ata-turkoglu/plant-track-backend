import db from '../db/knex.js';
import { createMaintenanceWorkOrder } from './maintenanceWorkOrders.js';
import { buildPaginationMeta } from '../utils/pagination.js';

const PLAN_COLUMNS = [
  'mp.id',
  'mp.organization_id',
  'mp.asset_id',
  'mp.plan_type',
  'mp.title',
  'mp.note',
  'mp.priority',
  'mp.runtime_interval',
  'mp.runtime_unit',
  'mp.next_due_runtime',
  'mp.assigned_firm_id',
  db.raw("coalesce(mp.assigned_employee_ids, '{}'::int[]) as assigned_employee_ids"),
  'mp.active',
  'mp.last_triggered_at',
  'mp.created_by_user_id',
  'mp.created_at',
  'mp.updated_at',
  db.raw('a.name as asset_name'),
  db.raw('a.code as asset_code'),
  db.raw('a.runtime_meter_value as asset_runtime_meter_value'),
  db.raw('a.runtime_meter_unit as asset_runtime_meter_unit'),
  db.raw('f.name as assigned_firm_name')
];

function basePlanQuery(organizationId) {
  return db('maintenance_plans as mp')
    .leftJoin({ a: 'assets' }, function joinAsset() {
      this.on('a.id', '=', 'mp.asset_id').andOn('a.organization_id', '=', 'mp.organization_id');
    })
    .leftJoin({ f: 'firms' }, function joinFirm() {
      this.on('f.id', '=', 'mp.assigned_firm_id').andOn('f.organization_id', '=', 'mp.organization_id');
    })
    .where('mp.organization_id', organizationId);
}

function normalizeRuntimeUnit(value) {
  return value === 'KM' ? 'KM' : 'HOUR';
}

function normalizeEmployeeIds(values) {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  for (const raw of values) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    unique.add(Math.trunc(numeric));
  }
  return Array.from(unique);
}

function toNumberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export async function listMaintenancePlansByOrganization(organizationId, { assetId, active, page, pageSize } = {}) {
  const normalizedPage = Number.isFinite(Number(page)) && Number(page) > 0 ? Math.trunc(Number(page)) : 1;
  const normalizedPageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Math.trunc(Number(pageSize)) : 20;

  const query = basePlanQuery(organizationId)
    .select(PLAN_COLUMNS)
    .orderBy([
      { column: 'mp.active', order: 'desc' },
      { column: 'mp.next_due_runtime', order: 'asc' },
      { column: 'mp.id', order: 'asc' }
    ]);

  const numericAssetId = Number(assetId);
  if (Number.isFinite(numericAssetId) && numericAssetId > 0) query.andWhere('mp.asset_id', numericAssetId);

  if (active === true || active === false) query.andWhere('mp.active', active);

  const [{ count }] = await query.clone().clearSelect().clearOrder().count({ count: 'mp.id' });
  const rows = await query.clone().limit(normalizedPageSize).offset((normalizedPage - 1) * normalizedPageSize);
  return { rows, pagination: buildPaginationMeta(count, normalizedPage, normalizedPageSize) };
}

export async function getMaintenancePlanById(organizationId, planId) {
  return basePlanQuery(organizationId).andWhere('mp.id', planId).first(PLAN_COLUMNS);
}

export async function createRuntimeMaintenancePlan(
  trx,
  {
    organizationId,
    assetId,
    title,
    note,
    priority,
    runtimeInterval,
    runtimeUnit,
    nextDueRuntime,
    assignedFirmId,
    assignedEmployeeIds,
    createdByUserId
  }
) {
  const rows = await trx('maintenance_plans')
    .insert({
      organization_id: organizationId,
      asset_id: assetId,
      plan_type: 'RUNTIME',
      title,
      note: note ?? null,
      priority: priority ?? 'MEDIUM',
      runtime_interval: runtimeInterval,
      runtime_unit: normalizeRuntimeUnit(runtimeUnit),
      next_due_runtime: nextDueRuntime,
      assigned_firm_id: assignedFirmId ?? null,
      assigned_employee_ids: normalizeEmployeeIds(assignedEmployeeIds),
      active: true,
      created_by_user_id: createdByUserId ?? null
    })
    .returning(['id']);

  return rows[0] ?? null;
}

export async function setMaintenancePlanActive(trx, { organizationId, planId, active }) {
  const rows = await trx('maintenance_plans')
    .where({
      id: planId,
      organization_id: organizationId
    })
    .update({
      active: Boolean(active),
      updated_at: trx.fn.now()
    })
    .returning(['id']);

  return rows[0] ?? null;
}

export async function processRuntimeMaintenancePlans(trx, { organizationId, assetIds, createdByUserId = null, maxOrdersPerPlan = 12 }) {
  const normalizedAssetIds = Array.from(
    new Set((Array.isArray(assetIds) ? assetIds : []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))
  );
  if (normalizedAssetIds.length === 0) return { createdWorkOrderIds: [], triggeredPlanIds: [] };

  const assets = await trx('assets')
    .where({ organization_id: organizationId })
    .whereIn('id', normalizedAssetIds)
    .select(['id', 'name', 'runtime_meter_value', 'runtime_meter_unit']);

  if (assets.length === 0) return { createdWorkOrderIds: [], triggeredPlanIds: [] };

  const assetById = new Map(assets.map((asset) => [Number(asset.id), asset]));

  const plans = await trx('maintenance_plans')
    .where({
      organization_id: organizationId,
      active: true,
      plan_type: 'RUNTIME'
    })
    .whereIn('asset_id', normalizedAssetIds)
    .select([
      'id',
      'asset_id',
      'title',
      'note',
      'priority',
      'runtime_interval',
      'runtime_unit',
      'next_due_runtime',
      'assigned_firm_id',
      db.raw("coalesce(assigned_employee_ids, '{}'::int[]) as assigned_employee_ids")
    ])
    .orderBy([{ column: 'id', order: 'asc' }]);

  if (plans.length === 0) return { createdWorkOrderIds: [], triggeredPlanIds: [] };

  const createdWorkOrderIds = [];
  const triggeredPlanIds = [];

  for (const plan of plans) {
    const asset = assetById.get(Number(plan.asset_id));
    if (!asset) continue;

    const runtimeUnit = normalizeRuntimeUnit(plan.runtime_unit);
    const assetRuntimeUnit = normalizeRuntimeUnit(asset.runtime_meter_unit);
    if (runtimeUnit !== assetRuntimeUnit) continue;

    const currentRuntime = toNumberOr(asset.runtime_meter_value, 0);
    const runtimeInterval = toNumberOr(plan.runtime_interval, 0);
    let nextDueRuntime = toNumberOr(plan.next_due_runtime, 0);
    if (!(runtimeInterval > 0) || !(nextDueRuntime >= 0)) continue;
    if (currentRuntime + 1e-9 < nextDueRuntime) continue;

    const normalizedAssignedEmployeeIds = normalizeEmployeeIds(plan.assigned_employee_ids);
    let createdCountForPlan = 0;

    while (currentRuntime + 1e-9 >= nextDueRuntime && createdCountForPlan < maxOrdersPerPlan) {
      const threshold = Math.round(nextDueRuntime * 1000) / 1000;
      const runtimeUnitLabel = runtimeUnit === 'KM' ? 'km' : 'h';
      const noteParts = [];
      if (typeof plan.note === 'string' && plan.note.trim()) noteParts.push(plan.note.trim());
      noteParts.push(`Auto-generated by runtime maintenance plan #${plan.id}. Threshold: ${threshold} ${runtimeUnitLabel}.`);

      const created = await createMaintenanceWorkOrder(trx, {
        organizationId,
        assetId: Number(plan.asset_id),
        type: 'PREVENTIVE',
        priority: plan.priority ?? 'MEDIUM',
        title: plan.title,
        symptom: null,
        note: noteParts.join('\n\n'),
        openImagesJson: [],
        plannedAt: trx.fn.now(),
        assignedFirmId: plan.assigned_firm_id ?? null,
        assignedEmployeeIds: normalizedAssignedEmployeeIds,
        createdByUserId
      });

      if (created?.id != null) createdWorkOrderIds.push(Number(created.id));
      nextDueRuntime = Math.round((nextDueRuntime + runtimeInterval) * 1000) / 1000;
      createdCountForPlan += 1;
    }

    if (createdCountForPlan > 0) {
      triggeredPlanIds.push(Number(plan.id));
      await trx('maintenance_plans')
        .where({
          id: plan.id,
          organization_id: organizationId
        })
        .update({
          next_due_runtime: nextDueRuntime,
          last_triggered_at: trx.fn.now(),
          updated_at: trx.fn.now()
        });
    }
  }

  return { createdWorkOrderIds, triggeredPlanIds };
}
