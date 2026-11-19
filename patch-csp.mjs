import { readFileSync, writeFileSync } from 'node:fs';
const p = 'src/index.ts';
let s = readFileSync(p, 'utf8');
const a = `app.use(cookieParser());\n`;
if (!s.includes(a)) { console.log('ANCHOR MISS'); process.exit(1); }
if (s.includes("'Content-Security-Policy'")) { console.log('already there'); process.exit(0); }
const mw = `app.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://auth.privy.io https://*.privy.io",
      "frame-src https://auth.privy.io https://*.privy.io",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; '),
  );
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
`;
s = s.split(a).join(a + mw);
writeFileSync(p, s);
console.log('headers added');
