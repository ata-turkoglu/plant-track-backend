import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import {
  createLocationType,
  ensureDefaultLocationTypesForOrganization,
  getLocationTypeByCode,
  listLocationTypesByOrganization
} from '../models/locationTypes.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

function normalizeTypeCode(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 64);
}

async function buildUniqueCode(organizationId, requestedCode, fallbackName) {
  const baseCode = normalizeTypeCode(requestedCode) || normalizeTypeCode(fallbackName) || 'location_type';

  let candidate = baseCode;
  let suffix = 2;
  while (suffix < 5000) {
    const existing = await getLocationTypeByCode(organizationId, candidate);
    if (!existing) return candidate;
    candidate = `${baseCode}_${suffix}`;
    suffix += 1;
  }

  return `${baseCode}_${Date.now()}`;
}

router.get('/organizations/:id/location-types', (req, res) => {
  const organizationId = req.organizationId;

  return Promise.resolve()
    .then(async () => {
      await db.transaction((trx) => ensureDefaultLocationTypesForOrganization(trx, organizationId));
      return listLocationTypesByOrganization(organizationId);
    })
    .then((locationTypes) => {
      return res.status(200).json({ location_types: locationTypes });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch location types' }));
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  code: z.string().trim().max(64).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable()
});

router.post('/organizations/:id/location-types', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      await db.transaction((trx) => ensureDefaultLocationTypesForOrganization(trx, organizationId));
      const code = await buildUniqueCode(organizationId, parsed.data.code ?? '', parsed.data.name);
      const created = await db.transaction((trx) =>
        createLocationType(trx, {
          organizationId,
          code,
          name: parsed.data.name,
          description: parsed.data.description ?? null
        })
      );
      return created;
    })
    .then((locationType) => {
      return res.status(201).json({ location_type: locationType });
    })
    .catch((err) => {
      if (String(err?.code ?? '') === '23505') {
        return res.status(409).json({ message: 'Location type already exists' });
      }
      return res.status(500).json({ message: 'Failed to create location type' });
    });
});

export default router;
