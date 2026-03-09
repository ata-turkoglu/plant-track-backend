import { Router } from 'express';
import { z } from 'zod';
import db from '../db/knex.js';
import {
  createUnitConversion,
  deleteUnitConversion,
  findResolvedUnitConversion,
  getUnitConversionById,
  listUnitConversionsByOrganization,
  updateUnitConversion
} from '../models/unitConversions.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

const payloadSchema = z.object({
  from_unit_id: z.coerce.number().int().positive(),
  to_unit_id: z.coerce.number().int().positive(),
  factor: z.union([z.string().trim().min(1), z.number().positive()])
});

const resolveSchema = z.object({
  from_unit_id: z.coerce.number().int().positive(),
  to_unit_id: z.coerce.number().int().positive(),
  quantity: z.union([z.string().trim().min(1), z.number()]).optional()
});

function normalizeFactor(value) {
  const raw = typeof value === 'number' ? String(value) : value.trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return raw;
}

function normalizeDecimal(value) {
  const raw = typeof value === 'number' ? String(value) : value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return raw;
}

async function getUnitsByIds(organizationId, ids) {
  return db('units')
    .where({ organization_id: organizationId })
    .whereIn('id', ids)
    .select(['id', 'organization_id', 'code', 'dimension']);
}

router.get('/organizations/:id/unit-conversions', (req, res) => {
  const organizationId = req.organizationId;
  return Promise.resolve()
    .then(() => listUnitConversionsByOrganization(organizationId))
    .then((conversions) => res.status(200).json({ conversions }))
    .catch(() => res.status(500).json({ message: 'Failed to fetch unit conversions' }));
});

router.post('/organizations/:id/unit-conversions/resolve', (req, res) => {
  const organizationId = req.organizationId;
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const fromUnitId = parsed.data.from_unit_id;
      const toUnitId = parsed.data.to_unit_id;
      const quantity = parsed.data.quantity != null ? normalizeDecimal(parsed.data.quantity) : null;
      if (parsed.data.quantity != null && !quantity) return { invalidQuantity: true };

      const units = await getUnitsByIds(organizationId, [fromUnitId, toUnitId]);
      if (units.length !== 2) return { unitNotFound: true };

      const fromUnit = units.find((row) => row.id === fromUnitId);
      const toUnit = units.find((row) => row.id === toUnitId);
      if (!fromUnit || !toUnit) return { unitNotFound: true };
      if (fromUnit.dimension !== toUnit.dimension) return { dimensionMismatch: true };

      if (fromUnitId === toUnitId) {
        const identity = {
          factor: '1',
          mode: 'identity'
        };

        if (quantity == null) {
          return {
            conversion: {
              from_unit_id: fromUnitId,
              to_unit_id: toUnitId,
              factor: identity.factor,
              mode: identity.mode
            }
          };
        }

        return {
          conversion: {
            from_unit_id: fromUnitId,
            to_unit_id: toUnitId,
            factor: identity.factor,
            mode: identity.mode
          },
          quantity: {
            input: quantity,
            output: quantity
          }
        };
      }

      const resolved = await findResolvedUnitConversion({
        organizationId,
        fromUnitId,
        toUnitId
      });
      if (!resolved) return { notFound: true };

      const factor =
        resolved.mode === 'direct'
          ? String(resolved.factor)
          : (
              await db.raw('select (1::numeric / ?::numeric)::text as value', [String(resolved.factor)])
            ).rows[0]?.value;

      if (!factor) return { notFound: true };

      if (quantity == null) {
        return {
          conversion: {
            from_unit_id: fromUnitId,
            to_unit_id: toUnitId,
            factor,
            mode: resolved.mode
          }
        };
      }

      const convertedQuantity = (
        await db.raw('select (?::numeric * ?::numeric)::text as value', [quantity, factor])
      ).rows[0]?.value;

      return {
        conversion: {
          from_unit_id: fromUnitId,
          to_unit_id: toUnitId,
          factor,
          mode: resolved.mode
        },
        quantity: {
          input: quantity,
          output: convertedQuantity ?? null
        }
      };
    })
    .then((result) => {
      if (result.invalidQuantity) return res.status(400).json({ message: 'Invalid quantity' });
      if (result.unitNotFound) return res.status(404).json({ message: 'Unit not found' });
      if (result.dimensionMismatch) return res.status(422).json({ message: 'Unit dimensions must match' });
      if (result.notFound) return res.status(422).json({ message: 'Unit conversion not found' });
      return res.status(200).json(result);
    })
    .catch(() => res.status(500).json({ message: 'Failed to resolve unit conversion' }));
});

router.post('/organizations/:id/unit-conversions', (req, res) => {
  const organizationId = req.organizationId;
  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const factor = normalizeFactor(parsed.data.factor);
      if (!factor) return { invalidFactor: true };

      const fromUnitId = parsed.data.from_unit_id;
      const toUnitId = parsed.data.to_unit_id;
      if (fromUnitId === toUnitId) return { invalidPair: true };

      const units = await getUnitsByIds(organizationId, [fromUnitId, toUnitId]);
      if (units.length !== 2) return { unitNotFound: true };

      const fromUnit = units.find((row) => row.id === fromUnitId);
      const toUnit = units.find((row) => row.id === toUnitId);
      if (!fromUnit || !toUnit) return { unitNotFound: true };
      if (fromUnit.dimension !== toUnit.dimension) return { dimensionMismatch: true };

      const conflict = await db('unit_conversions')
        .where({
          organization_id: organizationId,
          from_unit_id: fromUnitId,
          to_unit_id: toUnitId
        })
        .first(['id']);
      if (conflict) return { conflict: true };

      const reverseConflict = await db('unit_conversions')
        .where({
          organization_id: organizationId,
          from_unit_id: toUnitId,
          to_unit_id: fromUnitId
        })
        .first(['id']);
      if (reverseConflict) return { reverseConflict: true };

      const conversion = await db.transaction((trx) =>
        createUnitConversion(trx, {
          organizationId,
          fromUnitId,
          toUnitId,
          factor
        })
      );

      return { conversion };
    })
    .then((result) => {
      if (result.invalidFactor) return res.status(400).json({ message: 'Invalid conversion factor' });
      if (result.invalidPair) return res.status(400).json({ message: 'Source and target units must differ' });
      if (result.unitNotFound) return res.status(404).json({ message: 'Unit not found' });
      if (result.dimensionMismatch) return res.status(422).json({ message: 'Unit dimensions must match' });
      if (result.conflict) return res.status(409).json({ message: 'Unit conversion already exists' });
      if (result.reverseConflict) return res.status(409).json({ message: 'Reverse unit conversion already exists' });
      return res.status(201).json({ conversion: result.conversion });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create unit conversion' }));
});

router.patch('/unit-conversions/:id', (req, res) => {
  const conversionId = Number(req.params.id);
  if (!Number.isFinite(conversionId)) {
    return res.status(400).json({ message: 'Invalid unit conversion id' });
  }

  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await getUnitConversionById(conversionId);
      if (!existing) return { notFound: true };
      if (existing.system) return { systemLocked: true };

      const factor = normalizeFactor(parsed.data.factor);
      if (!factor) return { invalidFactor: true };

      const fromUnitId = parsed.data.from_unit_id;
      const toUnitId = parsed.data.to_unit_id;
      if (fromUnitId === toUnitId) return { invalidPair: true };

      const units = await getUnitsByIds(existing.organization_id, [fromUnitId, toUnitId]);
      if (units.length !== 2) return { unitNotFound: true };

      const fromUnit = units.find((row) => row.id === fromUnitId);
      const toUnit = units.find((row) => row.id === toUnitId);
      if (!fromUnit || !toUnit) return { unitNotFound: true };
      if (fromUnit.dimension !== toUnit.dimension) return { dimensionMismatch: true };

      const conflict = await db('unit_conversions')
        .where({
          organization_id: existing.organization_id,
          from_unit_id: fromUnitId,
          to_unit_id: toUnitId
        })
        .whereNot({ id: conversionId })
        .first(['id']);
      if (conflict) return { conflict: true };

      const reverseConflict = await db('unit_conversions')
        .where({
          organization_id: existing.organization_id,
          from_unit_id: toUnitId,
          to_unit_id: fromUnitId
        })
        .whereNot({ id: conversionId })
        .first(['id']);
      if (reverseConflict) return { reverseConflict: true };

      const conversion = await db.transaction((trx) =>
        updateUnitConversion(trx, {
          id: conversionId,
          organizationId: existing.organization_id,
          fromUnitId,
          toUnitId,
          factor
        })
      );

      return { conversion };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Unit conversion not found' });
      if (result.systemLocked) return res.status(400).json({ message: 'System unit conversion cannot be updated' });
      if (result.invalidFactor) return res.status(400).json({ message: 'Invalid conversion factor' });
      if (result.invalidPair) return res.status(400).json({ message: 'Source and target units must differ' });
      if (result.unitNotFound) return res.status(404).json({ message: 'Unit not found' });
      if (result.dimensionMismatch) return res.status(422).json({ message: 'Unit dimensions must match' });
      if (result.conflict) return res.status(409).json({ message: 'Unit conversion already exists' });
      if (result.reverseConflict) return res.status(409).json({ message: 'Reverse unit conversion already exists' });
      if (!result.conversion) return res.status(404).json({ message: 'Unit conversion not found' });
      return res.status(200).json({ conversion: result.conversion });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update unit conversion' }));
});

router.delete('/unit-conversions/:id', (req, res) => {
  const conversionId = Number(req.params.id);
  if (!Number.isFinite(conversionId)) {
    return res.status(400).json({ message: 'Invalid unit conversion id' });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await getUnitConversionById(conversionId);
      if (!existing) return { notFound: true };
      if (existing.system) return { systemLocked: true };

      const deleted = await db.transaction((trx) =>
        deleteUnitConversion(trx, {
          id: conversionId,
          organizationId: existing.organization_id
        })
      );

      return { deleted };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Unit conversion not found' });
      if (result.systemLocked) return res.status(400).json({ message: 'System unit conversion cannot be deleted' });
      if (!result.deleted) return res.status(404).json({ message: 'Unit conversion not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete unit conversion' }));
});

export default router;
