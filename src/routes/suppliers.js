import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import {
  listSuppliersByOrganization,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  findSupplierConflict
} from '../models/suppliers.js';
import { upsertRefNode, deleteRefNode } from '../models/nodes.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

router.get('/organizations/:id/suppliers', (req, res) => {
  const organizationId = req.organizationId;

  const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;

  return Promise.resolve()
    .then(() => listSuppliersByOrganization(organizationId, { kind }))
    .then((suppliers) => {
      return res.status(200).json({ suppliers });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch suppliers' }));
});

const createSchema = z.object({
  kind: z.enum(['SUPPLIER_EXTERNAL', 'SUPPLIER_INTERNAL']),
  name: z.string().min(1).max(255),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  address: z.string().max(4000).optional().nullable(),
  tax_no: z.string().max(64).optional().nullable(),
  contact_name: z.string().max(255).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
  active: z.boolean().optional()
});

router.post('/organizations/:id/suppliers', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const conflict = await findSupplierConflict(organizationId, {
        kind: parsed.data.kind,
        name: parsed.data.name,
        email: parsed.data.email ?? undefined,
        phone: parsed.data.phone ?? undefined
      });
      if (conflict) {
        if (String(conflict.kind) === String(parsed.data.kind) && String(conflict.name).toLowerCase() === String(parsed.data.name).toLowerCase()) {
          return { conflict: true };
        }
        if (parsed.data.email && conflict.email && String(conflict.email).toLowerCase() === String(parsed.data.email).toLowerCase()) {
          return { conflictEmail: true };
        }
        if (parsed.data.phone && conflict.phone && String(conflict.phone) === String(parsed.data.phone)) return { conflictPhone: true };
      }

      const supplier = await db.transaction(async (trx) =>
        createSupplier(trx, {
          organizationId,
          kind: parsed.data.kind,
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
            nodeType: 'SUPPLIER',
            refTable: 'suppliers',
            refId: created.id,
            name: created.name,
            code: created.kind,
            isStocked: false,
            metaJson: {
              kind: created.kind,
              active: created.active,
              email: created.email ?? null,
              phone: created.phone ?? null
            }
          });
          return created;
        })
      );

      return { supplier };
    })
    .then((result) => {
      if (result.conflict) return res.status(409).json({ message: 'Supplier already exists' });
      if (result.conflictEmail) return res.status(409).json({ message: 'Supplier email already exists' });
      if (result.conflictPhone) return res.status(409).json({ message: 'Supplier phone already exists' });
      return res.status(201).json({ supplier: result.supplier });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create supplier' }));
});

const updateSchema = z.object({
  kind: z.enum(['SUPPLIER_EXTERNAL', 'SUPPLIER_INTERNAL']),
  name: z.string().min(1).max(255),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  address: z.string().max(4000).optional().nullable(),
  tax_no: z.string().max(64).optional().nullable(),
  contact_name: z.string().max(255).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
  active: z.boolean().optional()
});

router.put('/organizations/:id/suppliers/:supplierId', (req, res) => {
  const organizationId = req.organizationId;
  const supplierId = Number(req.params.supplierId);
  if (!Number.isFinite(supplierId)) return res.status(400).json({ message: 'Invalid supplier id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await db('suppliers').where({ id: supplierId, organization_id: organizationId }).first(['id']);
      if (!existing) return { notFoundSupplier: true };

      const conflict = await findSupplierConflict(organizationId, {
        kind: parsed.data.kind,
        name: parsed.data.name,
        email: parsed.data.email ?? undefined,
        phone: parsed.data.phone ?? undefined,
        excludeId: supplierId
      });
      if (conflict) {
        if (String(conflict.kind) === String(parsed.data.kind) && String(conflict.name).toLowerCase() === String(parsed.data.name).toLowerCase()) {
          return { conflict: true };
        }
        if (parsed.data.email && conflict.email && String(conflict.email).toLowerCase() === String(parsed.data.email).toLowerCase()) {
          return { conflictEmail: true };
        }
        if (parsed.data.phone && conflict.phone && String(conflict.phone) === String(parsed.data.phone)) return { conflictPhone: true };
      }

      const supplier = await db.transaction(async (trx) =>
        updateSupplier(trx, {
          organizationId,
          supplierId,
          kind: parsed.data.kind,
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
            nodeType: 'SUPPLIER',
            refTable: 'suppliers',
            refId: updated.id,
            name: updated.name,
            code: updated.kind,
            isStocked: false,
            metaJson: {
              kind: updated.kind,
              active: updated.active,
              email: updated.email ?? null,
              phone: updated.phone ?? null
            }
          });
          return updated;
        })
      );

      return { supplier };
    })
    .then((result) => {
      if (result.notFoundSupplier) return res.status(404).json({ message: 'Supplier not found' });
      if (result.conflict) return res.status(409).json({ message: 'Supplier already exists' });
      if (result.conflictEmail) return res.status(409).json({ message: 'Supplier email already exists' });
      if (result.conflictPhone) return res.status(409).json({ message: 'Supplier phone already exists' });
      if (!result.supplier) return res.status(404).json({ message: 'Supplier not found' });
      return res.status(200).json({ supplier: result.supplier });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update supplier' }));
});

router.delete('/organizations/:id/suppliers/:supplierId', (req, res) => {
  const organizationId = req.organizationId;
  const supplierId = Number(req.params.supplierId);
  if (!Number.isFinite(supplierId)) return res.status(400).json({ message: 'Invalid supplier id' });

  return Promise.resolve()
    .then(async () => {
      const existing = await db('suppliers').where({ id: supplierId, organization_id: organizationId }).first(['id']);
      if (!existing) return { notFoundSupplier: true };

      const deleted = await db.transaction(async (trx) => {
        const removed = await deleteSupplier(trx, { organizationId, supplierId });
        if (removed) {
          await deleteRefNode(trx, {
            organizationId,
            nodeType: 'SUPPLIER',
            refTable: 'suppliers',
            refId: supplierId
          });
        }
        return removed;
      });
      if (!deleted) return { notFoundSupplier: true };
      return { ok: true };
    })
    .then((result) => {
      if (result.notFoundSupplier) return res.status(404).json({ message: 'Supplier not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete supplier' }));
});

export default router;
