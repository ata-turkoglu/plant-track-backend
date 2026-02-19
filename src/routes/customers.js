import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import {
  listCustomersByOrganization,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  findCustomerConflict
} from '../models/customers.js';
import { upsertRefNode, deleteRefNode } from '../models/nodes.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

router.get('/organizations/:id/customers', (req, res) => {
  const organizationId = req.organizationId;

  return Promise.resolve()
    .then(() => listCustomersByOrganization(organizationId))
    .then((customers) => {
      return res.status(200).json({ customers });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch customers' }));
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  address: z.string().max(4000).optional().nullable(),
  tax_no: z.string().max(64).optional().nullable(),
  contact_name: z.string().max(255).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
  active: z.boolean().optional()
});

router.post('/organizations/:id/customers', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const conflict = await findCustomerConflict(organizationId, {
        name: parsed.data.name,
        email: parsed.data.email ?? undefined,
        phone: parsed.data.phone ?? undefined
      });
      if (conflict) {
        if (String(conflict.name).toLowerCase() === String(parsed.data.name).toLowerCase()) return { conflict: true };
        if (parsed.data.email && conflict.email && String(conflict.email).toLowerCase() === String(parsed.data.email).toLowerCase()) {
          return { conflictEmail: true };
        }
        if (parsed.data.phone && conflict.phone && String(conflict.phone) === String(parsed.data.phone)) return { conflictPhone: true };
      }

      const customer = await db.transaction(async (trx) =>
        createCustomer(trx, {
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
            nodeType: 'CUSTOMER',
            refTable: 'customers',
            refId: created.id,
            name: created.name,
            isStocked: false,
            metaJson: {
              active: created.active,
              email: created.email ?? null,
              phone: created.phone ?? null
            }
          });
          return created;
        })
      );

      return { customer };
    })
    .then((result) => {
      if (result.conflict) return res.status(409).json({ message: 'Customer already exists' });
      if (result.conflictEmail) return res.status(409).json({ message: 'Customer email already exists' });
      if (result.conflictPhone) return res.status(409).json({ message: 'Customer phone already exists' });
      return res.status(201).json({ customer: result.customer });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create customer' }));
});

const updateSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  address: z.string().max(4000).optional().nullable(),
  tax_no: z.string().max(64).optional().nullable(),
  contact_name: z.string().max(255).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
  active: z.boolean().optional()
});

router.put('/organizations/:id/customers/:customerId', (req, res) => {
  const organizationId = req.organizationId;
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await db('customers').where({ id: customerId, organization_id: organizationId }).first(['id']);
      if (!existing) return { notFoundCustomer: true };

      const conflict = await findCustomerConflict(organizationId, {
        name: parsed.data.name,
        email: parsed.data.email ?? undefined,
        phone: parsed.data.phone ?? undefined,
        excludeId: customerId
      });
      if (conflict) {
        if (String(conflict.name).toLowerCase() === String(parsed.data.name).toLowerCase()) return { conflict: true };
        if (parsed.data.email && conflict.email && String(conflict.email).toLowerCase() === String(parsed.data.email).toLowerCase()) {
          return { conflictEmail: true };
        }
        if (parsed.data.phone && conflict.phone && String(conflict.phone) === String(parsed.data.phone)) return { conflictPhone: true };
      }

      const customer = await db.transaction(async (trx) =>
        updateCustomer(trx, {
          organizationId,
          customerId,
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
            nodeType: 'CUSTOMER',
            refTable: 'customers',
            refId: updated.id,
            name: updated.name,
            isStocked: false,
            metaJson: {
              active: updated.active,
              email: updated.email ?? null,
              phone: updated.phone ?? null
            }
          });
          return updated;
        })
      );

      return { customer };
    })
    .then((result) => {
      if (result.notFoundCustomer) return res.status(404).json({ message: 'Customer not found' });
      if (result.conflict) return res.status(409).json({ message: 'Customer already exists' });
      if (result.conflictEmail) return res.status(409).json({ message: 'Customer email already exists' });
      if (result.conflictPhone) return res.status(409).json({ message: 'Customer phone already exists' });
      if (!result.customer) return res.status(404).json({ message: 'Customer not found' });
      return res.status(200).json({ customer: result.customer });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update customer' }));
});

router.delete('/organizations/:id/customers/:customerId', (req, res) => {
  const organizationId = req.organizationId;
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer id' });

  return Promise.resolve()
    .then(async () => {
      const existing = await db('customers').where({ id: customerId, organization_id: organizationId }).first(['id']);
      if (!existing) return { notFoundCustomer: true };

      const deleted = await db.transaction(async (trx) => {
        const removed = await deleteCustomer(trx, { organizationId, customerId });
        if (removed) {
          await deleteRefNode(trx, {
            organizationId,
            nodeType: 'CUSTOMER',
            refTable: 'customers',
            refId: customerId
          });
        }
        return removed;
      });
      if (!deleted) return { notFoundCustomer: true };
      return { ok: true };
    })
    .then((result) => {
      if (result.notFoundCustomer) return res.status(404).json({ message: 'Customer not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete customer' }));
});

export default router;
