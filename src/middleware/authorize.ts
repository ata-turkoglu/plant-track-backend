import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/apiError';

export const authorizeRoles = (...roles: Array<'admin' | 'user'>) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ApiError(401, 'Unauthorized');
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, 'Forbidden');
    }

    next();
  };
};
