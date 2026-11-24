import type { Request } from 'express';

/** Real client IP. Cloudflare overwrites CF-Connecting-IP, so a client cannot forge it. */
export const clientIp = (req: Request): string =>
  (req.headers['cf-connecting-ip'] as string) || req.ip || 'x';