import express from 'express';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import { health } from './http/health.js';
import { auth } from './http/routes/auth.js';
import { webhooks } from './http/routes/webhooks.js';
import { wallet } from './http/routes/wallet.js';
import { results } from './http/routes/results.js';
import { adminRouter } from './admin.js';
import { runRecon } from './recon.js';
import { runDailyCredit, runDailyCreditIfDue } from './jobs/daily.js';
import { releaseMatured } from './locks.js';
import { runReferral } from './jobs/referral.js';
import { releaseDue } from './vesting.js';
import { requireUser } from './http/mw/session.js';
import { pruneAuth } from './auth.js';
import { expireClaims } from './locks.js';
import { one, close } from './db.js';

const port = Number(process.env.PORT ?? 3000);
const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/results', results);

app.get('/health', async (_req, res) => {
  const h = await health();
  res.status(h.ok ? 200 : 503).json(h);
});

app.use('/auth', auth);
app.use('/webhooks', webhooks);
app.use('/wallet', wallet);
app.use('/admin', adminRouter);

app.get('/me', requireUser, async (req, res) => {
  const u = await one<{ email: string; deposit_addr: string }>(
    `select email, deposit_addr from users where id = $1`,
    [req.userId],
  );
  res.json({ email: u.email, depositAddress: u.deposit_addr });
});

const pub = join(process.cwd(), 'public');
app.use(express.static(pub, { extensions: ['html'], maxAge: '5m' }));

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api')) return next();
  res.sendFile(join(pub, 'index.html'));
});

const timers: NodeJS.Timeout[] = [];

function every(ms: number, fn: () => Promise<unknown>, label: string): void {
  const tick = () => {
    void fn().catch((e) => console.error(label, e instanceof Error ? e.message : e));
  };
  timers.push(setInterval(tick, ms));
}

let dailyTimer: NodeJS.Timeout | null = null;

function scheduleDailyCredit(): void {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 15, 0, 0,
  ));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  dailyTimer = setTimeout(() => {
    void runDailyCredit()
      .catch((e) => console.error('credit', e))
      .finally(() => scheduleDailyCredit());
  }, next.getTime() - now.getTime());
}

const server = app.listen(port, () => {
  console.log(`listening on ${port}`);
  every(15 * 60 * 1000, runRecon, 'recon');
  every(60 * 1000, releaseDue, 'vesting');
  every(60 * 1000, expireClaims, 'claims');
  every(60 * 1000, releaseMatured, 'release');
  every(5 * 60 * 1000, runReferral, 'referral');
  every(6 * 60 * 60 * 1000, pruneAuth, 'prune');
  void runDailyCreditIfDue().catch((e) => console.error('credit', e));
  scheduleDailyCredit();
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    for (const t of timers) clearInterval(t);
    server.close();
    await close();
    process.exit(0);
  });
}