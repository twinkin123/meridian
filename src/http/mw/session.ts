import type { Request, Response, NextFunction } from 'express';
import { sessionFromToken, touchSession, isAdmin, breakGlassOk } from '../../auth.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      sessionId?: string;
    }
  }
}

export function clientMeta(req: Request) {
  return { ua: req.header('user-agent') ?? null, ip: req.ip ?? null };
}

function track(id: string) {
  void touchSession(id).catch(() => {});
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.sid;
  if (!token) return res.status(401).json({ error: 'unauthenticated' });
  const s = await sessionFromToken(token);
  if (!s) {
    res.clearCookie('sid', { path: '/' });
    return res.status(401).json({ error: 'unauthenticated' });
  }
  req.userId = s.user_id;
  req.sessionId = s.id;
  track(s.id);
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.sid;
  if (token) {
    const s = await sessionFromToken(token);
    if (s) {
      req.userId = s.user_id;
      req.sessionId = s.id;
      track(s.id);
      if (await isAdmin(s.user_id)) return next();
    }
  }
  if (breakGlassOk(req.header('x-admin-token') ?? undefined)) return next();
  return res.status(401).json({ error: 'unauthenticated' });
}