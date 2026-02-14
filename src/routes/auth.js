import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { createOrganization } from '../models/organizations.js';
import { createUser, getUserByEmail } from '../models/users.js';

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
        user: {
          id: user.id,
          organization_id: user.organization_id,
          name: user.name,
          email: user.email,
          role: user.role
        },
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
          role: 'admin'
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
