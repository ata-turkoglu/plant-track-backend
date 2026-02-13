import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/apiError';
import { verifyAccessToken } from '../utils/token';

export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new ApiError(401, 'Authorization header is required');
  }

  const token = authorization.split(' ')[1];
  const payload = verifyAccessToken(token);

  req.user = {
    userId: payload.userId,
    role: payload.role,
    email: payload.email
  };

  next();
};
