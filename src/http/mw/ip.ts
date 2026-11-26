import type { Request } from 'express';
import { isIP } from 'node:net';

/** Real client IP. Cloudflare overwrites CF-Connecting-IP, so it cannot be forged
    through the proxy. The Railway origin is directly reachable though, so only
    trust the header when it actually parses as an IP. */
export const clientIp = (req: Request): string => {
  const header = req.headers['cf-connecting-ip'];
  const cf = Array.isArray(header) ? header[0] : header;
  if (cf && isIP(cf) !== 0) return cf;
  return req.ip || 'x';
};
