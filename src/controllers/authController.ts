import { Request, Response } from 'express';
import { db } from '../db/knex';
import { ApiError } from '../utils/apiError';
import { hashPassword, verifyPassword } from '../utils/password';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from '../utils/token';
import { nowIso } from '../utils/time';
import { validateEmail, validateName, validateStrongPassword } from '../utils/validators';

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'user';
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

const toPublicUser = (user: UserRow) => ({
  id: user.id,
  email: user.email,
  firstName: user.first_name,
  lastName: user.last_name,
  role: user.role,
  isActive: user.is_active,
  lastLoginAt: user.last_login_at,
  createdAt: user.created_at,
  updatedAt: user.updated_at
});

export const register = async (req: Request, res: Response): Promise<void> => {
  const { email, password, firstName, lastName } = req.body as {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  };

  if (!email || !password || !firstName || !lastName) {
    throw new ApiError(400, 'email, password, firstName and lastName are required');
  }

  validateEmail(email);
  validateStrongPassword(password);
  validateName(firstName, 'firstName');
  validateName(lastName, 'lastName');

  const existingUser = await db<UserRow>('users').where({ email: email.toLowerCase() }).first();
  if (existingUser) {
    throw new ApiError(409, 'Email is already in use');
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db<UserRow>('users')
    .insert({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      role: 'user',
      created_at: nowIso(),
      updated_at: nowIso()
    })
    .returning('*');

  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email
  });

  const refreshToken = signRefreshToken({ userId: user.id });

  await db('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hashToken(refreshToken),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });

  res.status(201).json({
    success: true,
    message: 'User registered',
    data: {
      user: toPublicUser(user),
      tokens: {
        accessToken,
        refreshToken
      }
    }
  });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    throw new ApiError(400, 'email and password are required');
  }

  const user = await db<UserRow>('users').where({ email: email.toLowerCase() }).first();

  if (!user || !user.is_active) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const loginTime = nowIso();
  await db<UserRow>('users').where({ id: user.id }).update({
    last_login_at: loginTime,
    updated_at: loginTime
  });

  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email
  });
  const refreshToken = signRefreshToken({ userId: user.id });

  await db('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hashToken(refreshToken),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        ...toPublicUser(user),
        lastLoginAt: loginTime
      },
      tokens: {
        accessToken,
        refreshToken
      }
    }
  });
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    throw new ApiError(400, 'refreshToken is required');
  }

  const payload = verifyRefreshToken(refreshToken);
  const payloadUserId = String(payload.userId);
  const tokenHash = hashToken(refreshToken);

  const tokenRecord = await db('refresh_tokens')
    .where({ token_hash: tokenHash, user_id: payloadUserId })
    .whereNull('revoked_at')
    .andWhere('expires_at', '>', nowIso())
    .first();

  if (!tokenRecord) {
    throw new ApiError(401, 'Refresh token is invalid or expired');
  }

  const user = await db<UserRow>('users').where('id', payloadUserId).first();
  if (!user || !user.is_active) {
    throw new ApiError(401, 'User not available');
  }

  const newAccessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email
  });

  const newRefreshToken = signRefreshToken({ userId: user.id });

  await db.transaction(async (trx) => {
    await trx('refresh_tokens').where({ token_hash: tokenHash }).update({ revoked_at: nowIso() });
    await trx('refresh_tokens').insert({
      user_id: user.id,
      token_hash: hashToken(newRefreshToken),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
  });

  res.status(200).json({
    success: true,
    message: 'Token refreshed',
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    }
  });
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    throw new ApiError(400, 'refreshToken is required');
  }

  const tokenHash = hashToken(refreshToken);
  await db('refresh_tokens').where({ token_hash: tokenHash }).update({ revoked_at: nowIso() });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };

  if (!email) {
    throw new ApiError(400, 'email is required');
  }

  validateEmail(email);

  // Security: do not leak whether a user exists.
  res.status(200).json({
    success: true,
    message: 'If the email exists, reset instructions have been sent.'
  });
};
