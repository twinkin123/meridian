import type { Request, Response, NextFunction } from 'express';
import { userFromToken } from '../../auth.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.sid;
  if (!token) return res.status(401).json({ error: 'unauthenticated' });
  const userId = await userFromToken(token);
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  req.userId = userId;
  next();
}