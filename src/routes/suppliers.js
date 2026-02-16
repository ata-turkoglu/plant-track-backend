import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { listSuppliersByOrganization, createSupplier, updateSupplier, deleteSupplier } from '../models/suppliers.js';
import { upsertRefNode, deleteRefNode } from '../models/nodes.js';

const router = Router();

router.get('/organizations/:id/suppliers', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });

  const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return null;
      return listSuppliersByOrganization(organizationId, { kind });
    })
    .then((suppliers) => {
      if (!suppliers) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ suppliers });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch suppliers' }));
});

const createSchema = z.object({
  kind: z.enum(['SUPPLIER_EXTERNAL', 'SUPPLIER_INTERNAL']),
  name: z.string().min(1).max(255),
  active: z.boolean().optional()
});

router.post('/organizations/:id/suppliers', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const conflict = await db('suppliers')
        .where({ organization_id: organizationId, kind: parsed.data.kind })
        .whereRaw('lower(name) = lower(?)', [parsed.data.name])
        .first(['id']);
      if (conflict) return { conflict: true };

      const supplier = await db.transaction(async (trx) =>
        createSupplier(trx, {
          organizationId,
          kind: parsed.data.kind,
          name: parsed.data.name,
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
            metaJson: { kind: created.kind, active: created.active }
          });
          return created;
        })
      );

      return { supplier };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.conflict) return res.status(409).json({ message: 'Supplier already exists' });
      return res.status(201).json({ supplier: result.supplier });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create supplier' }));
});

const updateSchema = z.object({
  kind: z.enum(['SUPPLIER_EXTERNAL', 'SUPPLIER_INTERNAL']),
  name: z.string().min(1).max(255),
  active: z.boolean().optional()
});

router.put('/organizations/:id/suppliers/:supplierId', (req, res) => {
  const organizationId = Number(req.params.id);
  const supplierId = Number(req.params.supplierId);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });
  if (!Number.isFinite(supplierId)) return res.status(400).json({ message: 'Invalid supplier id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const existing = await db('suppliers').where({ id: supplierId, organization_id: organizationId }).first(['id']);
      if (!existing) return { notFoundSupplier: true };

      const conflict = await db('suppliers')
        .where({ organization_id: organizationId, kind: parsed.data.kind })
        .whereNot({ id: supplierId })
        .whereRaw('lower(name) = lower(?)', [parsed.data.name])
        .first(['id']);
      if (conflict) return { conflict: true };

      const supplier = await db.transaction(async (trx) =>
        updateSupplier(trx, {
          organizationId,
          supplierId,
          kind: parsed.data.kind,
          name: parsed.data.name,
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
            metaJson: { kind: updated.kind, active: updated.active }
          });
          return updated;
        })
      );

      return { supplier };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.notFoundSupplier) return res.status(404).json({ message: 'Supplier not found' });
      if (result.conflict) return res.status(409).json({ message: 'Supplier already exists' });
      if (!result.supplier) return res.status(404).json({ message: 'Supplier not found' });
      return res.status(200).json({ supplier: result.supplier });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update supplier' }));
});

router.delete('/organizations/:id/suppliers/:supplierId', (req, res) => {
  const organizationId = Number(req.params.id);
  const supplierId = Number(req.params.supplierId);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });
  if (!Number.isFinite(supplierId)) return res.status(400).json({ message: 'Invalid supplier id' });

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

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
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.notFoundSupplier) return res.status(404).json({ message: 'Supplier not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete supplier' }));
});

export default router;
