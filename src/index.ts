import express from 'express';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import { health } from './http/health.js';
import { auth } from './http/routes/auth.js';
import { webhooks } from './http/routes/webhooks.js';
import { wallet } from './http/routes/wallet.js';
import { adminRouter } from './admin.js';
import { runRecon } from './recon.js';
import { runDailyCredit } from './jobs/daily.js';
import { runReferral } from './jobs/referral.js';
import { releaseDue } from './vesting.js';
import { requireUser } from './http/mw/session.js';
import { pruneAuth } from './auth.js';
import { expireClaims } from './locks.js';
import { one, close } from './db.js';

const port = Number(process.env.PORT ?? 3000);
const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/health', async (_req, res) => {
  const h = await health();
  res.status(h.ok ? 200 : 503).json(h);
});

app.use('/auth', auth);
app.use('/webhooks', webhooks);
app.use('/wallet', wallet);
app.use('/admin', adminRouter);

app.get('/me', requireUser, async (req, res) => {
  const u = await one<{
    email: string;
    deposit_addr: string;
    is_admin: boolean;
    must_change_pw: boolean;
  }>('select email, deposit_addr, is_admin, must_change_pw from users where id = $1', [req.userId]);
  res.json({
    email: u.email,
    depositAddress: u.deposit_addr,
    isAdmin: u.is_admin === true,
    mustChange: u.must_change_pw === true,
  });
});

const publicDir = join(process.cwd(), 'public');
// HTML must revalidate on every navigation, including Back, or a stale dashboard
// renders over a dead session. send() leaves an existing Cache-Control alone.
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
});
app.use(express.static(publicDir, { extensions: ['html'] }));

app.use((_req, res) => {
  res.status(404).sendFile(join(publicDir, 'index.html'));
});

const referralTimer = setInterval(() => {
  const now = new Date();
  if (now.getUTCDate() === 0 && now.getUTCHours() === 0) runReferral().catch((e) => console.error('referral', e));
}, 30 * 60 * 1000);

const creditTimer = setInterval(() => {
  const now = new Date();
  if (now.getUTCHours() === 0) runDailyCredit(now).catch((e) => console.error('credit', e));
}, 5 * 60 * 1000);

const vestTimer = setInterval(() => {
  releaseDue().catch((e) => console.error('vesting', e));
}, 60 * 1000);

const reconTimer = setInterval(() => {
  runRecon('cron').catch((e) => console.error('recon', e));
}, 15 * 60 * 1000);

const pruneTimer = setInterval(() => {
  pruneAuth().catch((e) => console.error('prune', e));
  expireClaims().catch((e) => console.error('expireClaims', e));
}, 6 * 60 * 60 * 1000);

const server = app.listen(port, () => console.log(`listening on ${port}`));

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    clearInterval(vestTimer);
    clearInterval(reconTimer);
    clearInterval(pruneTimer);
    clearInterval(creditTimer);
    clearInterval(referralTimer);
    server.close();
    await close();
    process.exit(0);
  });
}