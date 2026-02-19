import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import {
  listMovementsByOrganization,
  createMovementEvent,
  getMovementLineById,
  updateDraftMovementLine,
  deleteDraftMovementLine,
  listBalancesByOrganization
} from '../models/inventoryMovements.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

const lineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive(),
  unit_id: z.number().int().positive().optional(),
  from_node_id: z.number().int().positive(),
  to_node_id: z.number().int().positive()
});

const createSchema = z.object({
  event_type: z.string().min(1).max(32).optional(),
  status: z.enum(['DRAFT', 'POSTED', 'CANCELLED']).optional(),
  occurred_at: z.string().datetime().optional().nullable(),
  reference_type: z.string().max(64).optional().nullable(),
  reference_id: z.string().max(64).optional().nullable(),
  note: z.string().max(4000).optional().nullable(),
  lines: z.array(lineSchema).min(1).optional(),
  item_id: z.number().int().positive().optional(),
  quantity: z.number().positive().optional(),
  unit_id: z.number().int().positive().optional(),
  from_node_id: z.number().int().positive().optional(),
  to_node_id: z.number().int().positive().optional()
});

const updateSchema = createSchema;

function normalizeLines(payload) {
  if (payload.lines && payload.lines.length > 0) return payload.lines;

  if (payload.item_id && payload.quantity && payload.from_node_id && payload.to_node_id) {
    return [
      {
        item_id: payload.item_id,
        quantity: payload.quantity,
        unit_id: payload.unit_id,
        from_node_id: payload.from_node_id,
        to_node_id: payload.to_node_id
      }
    ];
  }

  return [];
}

async function validateLineInputs(organizationId, lines) {
  for (const line of lines) {
    if (line.from_node_id === line.to_node_id) return { sameNode: true };
  }

  const nodeIds = Array.from(
    new Set(lines.flatMap((line) => [line.from_node_id, line.to_node_id]).filter((value) => Number.isFinite(value)))
  );
  const itemIds = Array.from(new Set(lines.map((line) => line.item_id).filter((value) => Number.isFinite(value))));

  const [nodes, items] = await Promise.all([
    db('nodes')
      .where({ organization_id: organizationId })
      .whereIn('id', nodeIds)
      .select(['id']),
    db('items')
      .where({ organization_id: organizationId })
      .whereIn('id', itemIds)
      .select(['id', 'unit_id'])
  ]);

  const nodeIdSet = new Set(nodes.map((row) => row.id));
  const itemMap = new Map(items.map((row) => [row.id, row]));

  const requiredUnitIds = new Set();
  for (const line of lines) {
    if (!nodeIdSet.has(line.from_node_id)) return { badFromNode: true };
    if (!nodeIdSet.has(line.to_node_id)) return { badToNode: true };

    const item = itemMap.get(line.item_id);
    if (!item) return { badItem: true };

    requiredUnitIds.add(line.unit_id ?? item.unit_id);
  }

  const units = await db('units')
    .where({ organization_id: organizationId, active: true })
    .whereIn('id', Array.from(requiredUnitIds))
    .select(['id']);
  const unitIdSet = new Set(units.map((row) => row.id));

  const validatedLines = [];
  for (const line of lines) {
    const item = itemMap.get(line.item_id);
    const unitId = line.unit_id ?? item.unit_id;
    if (!unitIdSet.has(unitId)) return { badUnit: true };

    validatedLines.push({
      itemId: line.item_id,
      quantity: line.quantity,
      unitId,
      fromNodeId: line.from_node_id,
      toNodeId: line.to_node_id
    });
  }

  return { lines: validatedLines };
}

router.get('/organizations/:id/inventory-movements', (req, res) => {
  const organizationId = req.organizationId;

  const limit = Number(req.query.limit ?? 100);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;

  return Promise.resolve()
    .then(() => listMovementsByOrganization(organizationId, safeLimit))
    .then((movements) => {
      return res.status(200).json({ movements });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch movements' }));
});

router.get('/organizations/:id/inventory-balances', (req, res) => {
  const organizationId = req.organizationId;

  const nodeIds = typeof req.query.node_ids === 'string'
    ? req.query.node_ids.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v))
    : [];
  const itemIds = typeof req.query.item_ids === 'string'
    ? req.query.item_ids.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v))
    : [];
  const statuses = typeof req.query.statuses === 'string'
    ? req.query.statuses.split(',').map((v) => v.trim().toUpperCase()).filter((v) => v.length > 0)
    : ['POSTED'];

  const fromDate = typeof req.query.from_date === 'string' && req.query.from_date ? req.query.from_date : undefined;
  const toDate = typeof req.query.to_date === 'string' && req.query.to_date ? req.query.to_date : undefined;

  return Promise.resolve()
    .then(() => listBalancesByOrganization(organizationId, { nodeIds, itemIds, statuses, fromDate, toDate }))
    .then((balances) => {
      return res.status(200).json({ balances });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch balances' }));
});

router.post('/organizations/:id/inventory-movements', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  const linesInput = normalizeLines(parsed.data);
  if (linesInput.length === 0) {
    return res.status(400).json({ message: 'At least one line is required' });
  }

  return Promise.resolve()
    .then(async () => {
      const valid = await validateLineInputs(organizationId, linesInput);
      if (valid.sameNode) return { sameNode: true };
      if (valid.badFromNode) return { badFromNode: true };
      if (valid.badToNode) return { badToNode: true };
      if (valid.badItem) return { badItem: true };
      if (valid.badUnit) return { badUnit: true };

      const eventType = parsed.data.event_type ?? 'MOVE';
      const occurredAt = parsed.data.occurred_at ? new Date(parsed.data.occurred_at) : undefined;

      const created = await db.transaction(async (trx) =>
        createMovementEvent(trx, {
          organizationId,
          eventType,
          status: parsed.data.status ?? 'POSTED',
          occurredAt,
          referenceType: parsed.data.reference_type,
          referenceId: parsed.data.reference_id,
          note: parsed.data.note,
          createdByUserId: null,
          lines: valid.lines
        })
      );

      return created;
    })
    .then((result) => {
      if (result.badFromNode) return res.status(400).json({ message: 'Invalid from node' });
      if (result.badToNode) return res.status(400).json({ message: 'Invalid to node' });
      if (result.badItem) return res.status(400).json({ message: 'Invalid item' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.sameNode) return res.status(400).json({ message: 'From and to node cannot be same' });
      return res.status(201).json({ event: result.event, lines: result.lines, movement: result.lines[0] });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create movement event' }));
});

router.put('/organizations/:id/inventory-movements/:movementId', (req, res) => {
  const organizationId = req.organizationId;
  const movementId = Number(req.params.movementId);
  if (!Number.isFinite(movementId)) return res.status(400).json({ message: 'Invalid movement id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  const linesInput = normalizeLines(parsed.data);
  if (linesInput.length !== 1) {
    return res.status(400).json({ message: 'Update supports exactly one line payload' });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await getMovementLineById(organizationId, movementId);
      if (!existing) return { notFoundMovement: true };

      const valid = await validateLineInputs(organizationId, linesInput);
      if (valid.sameNode) return { sameNode: true };
      if (valid.badFromNode) return { badFromNode: true };
      if (valid.badToNode) return { badToNode: true };
      if (valid.badItem) return { badItem: true };
      if (valid.badUnit) return { badUnit: true };
      const validatedLine = valid.lines[0];

      const eventType = parsed.data.event_type ?? existing.event_type;
      const occurredAt = parsed.data.occurred_at ? new Date(parsed.data.occurred_at) : new Date(existing.occurred_at);

      const updated = await db.transaction(async (trx) =>
        updateDraftMovementLine(trx, {
          organizationId,
          lineId: movementId,
          eventType,
          occurredAt,
          referenceType: parsed.data.reference_type,
          referenceId: parsed.data.reference_id,
          note: parsed.data.note,
          itemId: validatedLine.itemId,
          unitId: validatedLine.unitId,
          fromNodeId: validatedLine.fromNodeId,
          toNodeId: validatedLine.toNodeId,
          quantity: validatedLine.quantity
        })
      );

      return updated;
    })
    .then((result) => {
      if (result.notFoundMovement) return res.status(404).json({ message: 'Movement not found' });
      if (result.badFromNode) return res.status(400).json({ message: 'Invalid from node' });
      if (result.badToNode) return res.status(400).json({ message: 'Invalid to node' });
      if (result.badItem) return res.status(400).json({ message: 'Invalid item' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.sameNode) return res.status(400).json({ message: 'From and to node cannot be same' });
      if (result.immutable) return res.status(409).json({ message: 'Posted/Canceled movement is immutable' });
      if (!result?.line) return res.status(404).json({ message: 'Movement not found' });
      return res.status(200).json({ movement: result.line });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update movement' }));
});

router.delete('/organizations/:id/inventory-movements/:movementId', (req, res) => {
  const organizationId = req.organizationId;
  const movementId = Number(req.params.movementId);
  if (!Number.isFinite(movementId)) return res.status(400).json({ message: 'Invalid movement id' });

  return Promise.resolve()
    .then(async () => {
      const deleted = await db.transaction(async (trx) => deleteDraftMovementLine(trx, { organizationId, lineId: movementId }));
      if (!deleted) return { notFoundMovement: true };
      return deleted;
    })
    .then((result) => {
      if (result.notFoundMovement) return res.status(404).json({ message: 'Movement not found' });
      if (result.immutable) return res.status(409).json({ message: 'Posted/Canceled movement is immutable' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete movement' }));
});

export default router;
