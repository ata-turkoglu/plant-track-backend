import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/apiError';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details ?? null
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
};
