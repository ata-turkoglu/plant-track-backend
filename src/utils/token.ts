import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { ApiError } from './apiError';

export interface AccessTokenPayload extends JwtPayload {
  userId: string | number;
  role: 'admin' | 'user';
  email: string;
}

export interface RefreshTokenPayload extends JwtPayload {
  userId: string | number;
}

export const signAccessToken = (payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string => {
  const options: SignOptions = { expiresIn: env.jwt.accessExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.jwt.accessSecret, options);
};

export const signRefreshToken = (payload: Omit<RefreshTokenPayload, 'iat' | 'exp'>): string => {
  const options: SignOptions = { expiresIn: env.jwt.refreshExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.jwt.refreshSecret, options);
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
  } catch {
    throw new ApiError(401, 'Invalid or expired access token');
  }
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  try {
    return jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};
