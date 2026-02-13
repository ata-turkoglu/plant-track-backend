import bcrypt from 'bcryptjs';
import { env } from '../config/env';

export const hashPassword = async (plainPassword: string): Promise<string> => {
  return bcrypt.hash(plainPassword, env.bcryptSaltRounds);
};

export const verifyPassword = async (plainPassword: string, passwordHash: string): Promise<boolean> => {
  return bcrypt.compare(plainPassword, passwordHash);
};
