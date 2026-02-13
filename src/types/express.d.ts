import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string | number;
        role: 'admin' | 'user';
        email: string;
      };
    }
  }
}

export {};
