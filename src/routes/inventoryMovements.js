import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { getItemById } from '../models/items.js';
import { getUnitById } from '../models/units.js';
import {
  listMovementsByOrganization,
  createMovementEvent,
  getMovementLineById,
  updateDraftMovementLine,
  deleteDraftMovementLine,
  listBalancesByOrganization
} from '../models/inventoryMovements.js';
import { getNodeById } from '../models/nodes.js';

const router = Router();

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

async function validateLineInput(organizationId, line) {
  if (line.from_node_id === line.to_node_id) return { sameNode: true };

  const [fromNode, toNode, item] = await Promise.all([
    getNodeById(line.from_node_id),
    getNodeById(line.to_node_id),
    getItemById(line.item_id)
  ]);

  if (!fromNode || fromNode.organization_id !== organizationId) return { badFromNode: true };
  if (!toNode || toNode.organization_id !== organizationId) return { badToNode: true };
  if (!item || item.organization_id !== organizationId) return { badItem: true };

  const unitId = line.unit_id ?? item.unit_id;
  const unit = await getUnitById(unitId);
  if (!unit || unit.organization_id !== organizationId || !unit.active) return { badUnit: true };

  return {
    line: {
      itemId: line.item_id,
      quantity: line.quantity,
      unitId,
      fromNodeId: line.from_node_id,
      toNodeId: line.to_node_id
    }
  };
}

router.get('/organizations/:id/inventory-movements', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });

  const limit = Number(req.query.limit ?? 100);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return null;
      return listMovementsByOrganization(organizationId, safeLimit);
    })
    .then((movements) => {
      if (!movements) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ movements });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch movements' }));
});

router.get('/organizations/:id/inventory-balances', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });

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
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return null;
      return listBalancesByOrganization(organizationId, { nodeIds, itemIds, statuses, fromDate, toDate });
    })
    .then((balances) => {
      if (!balances) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ balances });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch balances' }));
});

router.post('/organizations/:id/inventory-movements', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });

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
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const validatedLines = [];
      for (const lineInput of linesInput) {
        const valid = await validateLineInput(organizationId, lineInput);
        if (valid.sameNode) return { sameNode: true };
        if (valid.badFromNode) return { badFromNode: true };
        if (valid.badToNode) return { badToNode: true };
        if (valid.badItem) return { badItem: true };
        if (valid.badUnit) return { badUnit: true };
        validatedLines.push(valid.line);
      }

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
          lines: validatedLines
        })
      );

      return created;
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
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
  const organizationId = Number(req.params.id);
  const movementId = Number(req.params.movementId);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });
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

      const valid = await validateLineInput(organizationId, linesInput[0]);
      if (valid.sameNode) return { sameNode: true };
      if (valid.badFromNode) return { badFromNode: true };
      if (valid.badToNode) return { badToNode: true };
      if (valid.badItem) return { badItem: true };
      if (valid.badUnit) return { badUnit: true };

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
          itemId: valid.line.itemId,
          unitId: valid.line.unitId,
          fromNodeId: valid.line.fromNodeId,
          toNodeId: valid.line.toNodeId,
          quantity: valid.line.quantity
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
  const organizationId = Number(req.params.id);
  const movementId = Number(req.params.movementId);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });
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
