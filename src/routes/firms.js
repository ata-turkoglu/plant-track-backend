import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { createFirm, deleteFirm, findFirmConflict, getFirmById, listFirmsByOrganization, updateFirm } from '../models/firms.js';
import { deleteRefNode, findNodeByRef, upsertRefNode } from '../models/nodes.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';
import { parsePaginationQuery } from '../utils/pagination.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

router.get('/organizations/:id/firms', (req, res) => {
  const organizationId = req.organizationId;
  const activeText = typeof req.query.active === 'string' ? req.query.active.trim().toLowerCase() : '';
  if (activeText && activeText !== 'true' && activeText !== 'false') {
    return res.status(400).json({ message: 'Invalid active filter. Use true or false.' });
  }

  const pagination = parsePaginationQuery(req.query, { defaultPageSize: 12, maxPageSize: 100 });
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const name = typeof req.query.name === 'string' ? req.query.name : undefined;
  const email = typeof req.query.email === 'string' ? req.query.email : undefined;
  const phone = typeof req.query.phone === 'string' ? req.query.phone : undefined;
  const active = activeText ? activeText === 'true' : undefined;
  const sortField = typeof req.query.sortField === 'string' ? req.query.sortField : undefined;
  const sortOrder = typeof req.query.sortOrder === 'string' ? req.query.sortOrder : undefined;

  return Promise.resolve()
    .then(() =>
      listFirmsByOrganization(organizationId, {
        q,
        name,
        email,
        phone,
        active,
        sortField,
        sortOrder,
        page: pagination.enabled ? pagination.page : undefined,
        pageSize: pagination.enabled ? pagination.pageSize : undefined
      })
    )
    .then((result) => {
      if (pagination.enabled) return res.status(200).json({ firms: result.rows, pagination: result.pagination });
      return res.status(200).json({ firms: result });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch firms' }));
});

const upsertSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  address: z.string().max(4000).optional().nullable(),
  tax_no: z.string().max(64).optional().nullable(),
  contact_name: z.string().max(255).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
  active: z.boolean().optional()
});

function buildFirmNodeMeta(firm) {
  return {
    active: firm.active,
    email: firm.email ?? null,
    phone: firm.phone ?? null
  };
}

function getConflictResponse(conflict, payload) {
  if (!conflict) return null;
  if (String(conflict.name).toLowerCase() === String(payload.name).toLowerCase()) return { conflict: true };
  if (payload.email && conflict.email && String(conflict.email).toLowerCase() === String(payload.email).toLowerCase()) {
    return { conflictEmail: true };
  }
  if (payload.phone && conflict.phone && String(conflict.phone) === String(payload.phone)) return { conflictPhone: true };
  return null;
}

router.post('/organizations/:id/firms', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const conflict = await findFirmConflict(organizationId, {
        name: parsed.data.name,
        email: parsed.data.email ?? undefined,
        phone: parsed.data.phone ?? undefined
      });
      const conflictResult = getConflictResponse(conflict, parsed.data);
      if (conflictResult) return conflictResult;

      const firm = await db.transaction(async (trx) =>
        createFirm(trx, {
          organizationId,
          name: parsed.data.name,
          email: parsed.data.email ?? null,
          phone: parsed.data.phone ?? null,
          address: parsed.data.address ?? null,
          taxNo: parsed.data.tax_no ?? null,
          contactName: parsed.data.contact_name ?? null,
          notes: parsed.data.notes ?? null,
          active: parsed.data.active
        }).then(async (created) => {
          await upsertRefNode(trx, {
            organizationId,
            nodeType: 'FIRM',
            refTable: 'firms',
            refId: created.id,
            name: created.name,
            isStocked: false,
            metaJson: buildFirmNodeMeta(created)
          });
          return created;
        })
      );

      return { firm };
    })
    .then((result) => {
      if (result.conflict) return res.status(409).json({ message: 'Firm already exists' });
      if (result.conflictEmail) return res.status(409).json({ message: 'Firm email already exists' });
      if (result.conflictPhone) return res.status(409).json({ message: 'Firm phone already exists' });
      return res.status(201).json({ firm: result.firm });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create firm' }));
});

router.put('/organizations/:id/firms/:firmId', (req, res) => {
  const organizationId = req.organizationId;
  const firmId = Number(req.params.firmId);
  if (!Number.isFinite(firmId)) return res.status(400).json({ message: 'Invalid firm id' });

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await getFirmById(firmId);
      if (!existing || existing.organization_id !== organizationId) return { notFoundFirm: true };

      const conflict = await findFirmConflict(organizationId, {
        name: parsed.data.name,
        email: parsed.data.email ?? undefined,
        phone: parsed.data.phone ?? undefined,
        excludeId: firmId
      });
      const conflictResult = getConflictResponse(conflict, parsed.data);
      if (conflictResult) return conflictResult;

      const firm = await db.transaction(async (trx) =>
        updateFirm(trx, {
          organizationId,
          firmId,
          name: parsed.data.name,
          email: parsed.data.email ?? null,
          phone: parsed.data.phone ?? null,
          address: parsed.data.address ?? null,
          taxNo: parsed.data.tax_no ?? null,
          contactName: parsed.data.contact_name ?? null,
          notes: parsed.data.notes ?? null,
          active: parsed.data.active ?? true
        }).then(async (updated) => {
          if (!updated) return null;
          await upsertRefNode(trx, {
            organizationId,
            nodeType: 'FIRM',
            refTable: 'firms',
            refId: updated.id,
            name: updated.name,
            isStocked: false,
            metaJson: buildFirmNodeMeta(updated)
          });
          return updated;
        })
      );

      return { firm };
    })
    .then((result) => {
      if (result.notFoundFirm) return res.status(404).json({ message: 'Firm not found' });
      if (result.conflict) return res.status(409).json({ message: 'Firm already exists' });
      if (result.conflictEmail) return res.status(409).json({ message: 'Firm email already exists' });
      if (result.conflictPhone) return res.status(409).json({ message: 'Firm phone already exists' });
      if (!result.firm) return res.status(404).json({ message: 'Firm not found' });
      return res.status(200).json({ firm: result.firm });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update firm' }));
});

router.delete('/organizations/:id/firms/:firmId', (req, res) => {
  const organizationId = req.organizationId;
  const firmId = Number(req.params.firmId);
  if (!Number.isFinite(firmId)) return res.status(400).json({ message: 'Invalid firm id' });

  return Promise.resolve()
    .then(async () => {
      const existing = await getFirmById(firmId);
      if (!existing || existing.organization_id !== organizationId) return { notFoundFirm: true };

      const deleted = await db.transaction(async (trx) => {
        const node = await findNodeByRef(organizationId, 'FIRM', 'firms', firmId);
        if (node) {
          const linkedMovement = await trx('inventory_movement_lines')
            .where((qb) => qb.where({ from_node_id: node.id }).orWhere({ to_node_id: node.id }))
            .first(['id']);
          if (linkedMovement) {
            throw Object.assign(new Error('FIRM_NODE_IN_USE'), { code: 'FIRM_NODE_IN_USE' });
          }
        }

        const removed = await deleteFirm(trx, { organizationId, firmId });
        if (removed) {
          await deleteRefNode(trx, {
            organizationId,
            nodeType: 'FIRM',
            refTable: 'firms',
            refId: firmId
          });
        }
        return removed;
      });
      if (!deleted) return { notFoundFirm: true };
      return { ok: true };
    })
    .then((result) => {
      if (result.notFoundFirm) return res.status(404).json({ message: 'Firm not found' });
      return res.status(204).send();
    })
    .catch((err) => {
      if (err?.code === 'FIRM_NODE_IN_USE') {
        return res.status(409).json({ message: 'Firm is used in inventory movements and cannot be deleted.' });
      }
      return res.status(500).json({ message: 'Failed to delete firm' });
    });
});

export default router;
