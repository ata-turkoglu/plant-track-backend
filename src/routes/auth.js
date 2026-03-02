import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { createOrganization } from '../models/organizations.js';
import { createUser, getUserByEmail, getUserById, updateUserDefaultCurrency } from '../models/users.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const registerSchema = z.object({
  organization_name: z.string().min(2),
  organization_code: z.string().optional(),
  admin_name: z.string().min(2),
  admin_email: z.string().email(),
  admin_password: z.string().min(6),
  admin_language: z.enum(['tr', 'en']).default('tr')
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const profileQuerySchema = z.object({
  email: z.string().email()
});

function toProfilePayload(user) {
  return {
    id: user.id,
    organization_id: user.organization_id,
    name: user.name,
    email: user.email,
    role: user.role,
    default_currency_code: user.default_currency_code ?? null
  };
}

router.post('/auth/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten()
    });
  }

  const { email, password } = parsed.data;

  // Keep async in handler without changing signature style elsewhere
  Promise.resolve()
    .then(async () => {
      const user = await getUserByEmail(email);
      if (!user) return null;
      const ok = bcrypt.compareSync(password, user.password_hash);
      if (!ok) return null;
      return user;
    })
    .then(async (user) => {
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const org = await db('organizations')
        .where({ id: user.organization_id })
        .first(['id', 'name', 'code']);

      return res.status(200).json({
        message: 'Login successful',
        user: toProfilePayload(user),
        organization: org ?? null,
        token: 'demo-token'
      });
    })
    .catch(() => res.status(500).json({ message: 'Login failed' }));
});

router.post('/auth/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten()
    });
  }

  Promise.resolve()
    .then(async () => {
      const organizationName = parsed.data.organization_name;
      const organizationCode = parsed.data.organization_code;

      const existing = await getUserByEmail(parsed.data.admin_email);
      if (existing) {
        return { conflict: true };
      }

      const passwordHash = bcrypt.hashSync(parsed.data.admin_password, 10);

      const result = await db.transaction(async (trx) => {
        const org = await createOrganization(trx, { name: organizationName, code: organizationCode });
        const admin = await createUser(trx, {
          organizationId: org.id,
          name: parsed.data.admin_name,
          email: parsed.data.admin_email,
          passwordHash,
          role: 'admin',
          defaultCurrencyCode: null
        });
        return { org, admin };
      });

      return { conflict: false, ...result };
    })
    .then((result) => {
      if (result.conflict) {
        return res.status(409).json({ message: 'Email already registered' });
      }

      return res.status(201).json({
        message: 'Organization registered',
        organization: result.org,
        admin: result.admin
      });
    })
    .catch(() => res.status(500).json({ message: 'Register failed' }));
});

router.get('/auth/profile', (req, res) => {
  const parsed = profileQuerySchema.safeParse({ email: req.query.email });

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten()
    });
  }

  return Promise.resolve()
    .then(async () => {
      const user = await getUserByEmail(parsed.data.email);
      if (!user) return { notFound: true };
      return { user: toProfilePayload(user) };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'User not found' });
      return res.status(200).json(result);
    })
    .catch(() => res.status(500).json({ message: 'Profile fetch failed' }));
});

const updateProfileSchema = z.object({
  user_id: z.number().int().positive(),
  default_currency_code: z.string().trim().min(1).max(8).nullable()
});

router.put('/auth/profile', (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten()
    });
  }

  return Promise.resolve()
    .then(async () => {
      const user = await getUserById(parsed.data.user_id);
      if (!user) return { notFound: true };

      const nextCurrencyCode = parsed.data.default_currency_code?.trim().toUpperCase() || null;
      if (nextCurrencyCode) {
        const currency = await db('currencies')
          .where({ organization_id: user.organization_id })
          .whereRaw('upper(code) = ?', [nextCurrencyCode])
          .first(['id', 'code']);
        if (!currency) return { invalidCurrency: true };
      }

      const updated = await db.transaction((trx) =>
        updateUserDefaultCurrency(trx, {
          userId: user.id,
          organizationId: user.organization_id,
          defaultCurrencyCode: nextCurrencyCode
        })
      );
      return { updated };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'User not found' });
      if (result.invalidCurrency) return res.status(400).json({ message: 'Invalid currency' });
      return res.status(200).json({ user: result.updated });
    })
    .catch(() => res.status(500).json({ message: 'Profile update failed' }));
});

router.post('/auth/forgot-password', (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten()
    });
  }

  return res.status(200).json({
    message: `If ${parsed.data.email} exists, reset instructions were sent.`
  });
});

export default router;
