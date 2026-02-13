import { Request, Response } from 'express';
import { db } from '../db/knex';
import { ApiError } from '../utils/apiError';
import { hashPassword } from '../utils/password';
import { nowIso } from '../utils/time';
import { validateEmail, validateName, validateStrongPassword } from '../utils/validators';

interface UserRow {
  id: string | number;
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

export const createUser = async (req: Request, res: Response): Promise<void> => {
  const { email, password, firstName, lastName, role, isActive } = req.body as {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: 'admin' | 'user';
    isActive?: boolean;
  };

  if (!email || !password || !firstName || !lastName) {
    throw new ApiError(400, 'email, password, firstName and lastName are required');
  }

  validateEmail(email);
  validateStrongPassword(password);
  validateName(firstName, 'firstName');
  validateName(lastName, 'lastName');

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await db<UserRow>('users').where({ email: normalizedEmail }).first();
  if (existing) {
    throw new ApiError(409, 'Email is already in use');
  }

  const passwordHash = await hashPassword(password);
  const [created] = await db<UserRow>('users')
    .insert({
      email: normalizedEmail,
      password_hash: passwordHash,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      role: role === 'admin' ? 'admin' : 'user',
      is_active: isActive ?? true,
      created_at: nowIso(),
      updated_at: nowIso()
    })
    .returning('*');

  res.status(201).json({ success: true, message: 'User created', data: toPublicUser(created) });
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const user = await db<UserRow>('users').where({ id: userId }).first();
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json({ success: true, data: toPublicUser(user) });
};

export const updateMe = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const { firstName, lastName, password } = req.body as {
    firstName?: string;
    lastName?: string;
    password?: string;
  };

  const updatePayload: Record<string, unknown> = {
    updated_at: nowIso()
  };

  if (firstName !== undefined) {
    validateName(firstName, 'firstName');
    updatePayload.first_name = firstName.trim();
  }

  if (lastName !== undefined) {
    validateName(lastName, 'lastName');
    updatePayload.last_name = lastName.trim();
  }

  if (password !== undefined) {
    validateStrongPassword(password);
    updatePayload.password_hash = await hashPassword(password);
  }

  const [updated] = await db<UserRow>('users').where({ id: userId }).update(updatePayload).returning('*');

  if (!updated) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json({ success: true, message: 'Profile updated', data: toPublicUser(updated) });
};

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const safePage = page > 0 ? page : 1;
  const safeLimit = limit > 0 && limit <= 100 ? limit : 20;

  const [{ count }] = await db('users').count<{ count: string }[]>('* as count');

  const users = await db<UserRow>('users')
    .select('*')
    .orderBy('created_at', 'desc')
    .offset((safePage - 1) * safeLimit)
    .limit(safeLimit);

  res.status(200).json({
    success: true,
    data: users.map(toPublicUser),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: Number(count)
    }
  });
};

export const getUserById = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id;
  if (!id) {
    throw new ApiError(400, 'id is required');
  }

  const user = await db<UserRow>('users').where({ id }).first();

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json({ success: true, data: toPublicUser(user) });
};

export const updateUserById = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id;
  if (!id) {
    throw new ApiError(400, 'id is required');
  }

  const { email, firstName, lastName, role, isActive } = req.body as {
    email?: string;
    firstName?: string;
    lastName?: string;
    role?: 'admin' | 'user';
    isActive?: boolean;
  };

  const updatePayload: Record<string, unknown> = { updated_at: nowIso() };

  if (email !== undefined) {
    validateEmail(email);
    updatePayload.email = email.toLowerCase();
  }
  if (firstName !== undefined) {
    validateName(firstName, 'firstName');
    updatePayload.first_name = firstName.trim();
  }
  if (lastName !== undefined) {
    validateName(lastName, 'lastName');
    updatePayload.last_name = lastName.trim();
  }
  if (role !== undefined) {
    if (!['admin', 'user'].includes(role)) {
      throw new ApiError(400, 'role must be admin or user');
    }
    updatePayload.role = role;
  }
  if (isActive !== undefined) {
    updatePayload.is_active = isActive;
  }

  const [updated] = await db<UserRow>('users').where({ id }).update(updatePayload).returning('*');

  if (!updated) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json({ success: true, message: 'User updated', data: toPublicUser(updated) });
};

export const deactivateUserById = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id;
  if (!id) {
    throw new ApiError(400, 'id is required');
  }

  const [updated] = await db<UserRow>('users')
    .where({ id })
    .update({ is_active: false, updated_at: nowIso() })
    .returning('*');

  if (!updated) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json({ success: true, message: 'User deactivated', data: toPublicUser(updated) });
};
