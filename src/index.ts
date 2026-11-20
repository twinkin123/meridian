import 'express-async-errors';
import express from 'express';
import { jwks } from './jwks.js';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import { health } from './http/health.js';
import { auth } from './http/routes/auth.js';
import { walletAuth } from './http/routes/wallet-auth.js';
import { webhooks } from './http/routes/webhooks.js';
import { wallet } from './http/routes/wallet.js';
import { deposit } from './http/routes/deposit.js';
import { ensureDepositAddress } from './deposits.js';
import { results } from './http/routes/results.js';
import { adminRouter } from './admin.js';
import { sqlRouter } from './admin-sql.js';
import { runRecon, reconDue } from './recon.js';
import { runSettlement, runSettlementIfDue } from './jobs/settle.js';
import { revalueSolDeposits } from './jobs/revalue.js';
import { resumeStuckWithdrawals } from './jobs/resume.js';
import { payApproved } from './jobs/pay.js';
import { releaseMatured } from './locks.js';
import { backfillTrades, ensureToday } from './trades.js';
import { releaseDue } from './vesting.js';
import { requireUser } from './http/mw/session.js';
import { pruneAuth } from './auth.js';
import { expireClaims } from './locks.js';
import { pollDeposits } from './poll.js';
import { watchDeposits } from './jobs/deposit-watch.js';
import { refreshRoutes } from './deposit-routes.js';
import { runSweep, assertSweepDestination } from './sweeps.js';
import { one, close } from './db.js';
import { market } from './market.js';
import { swap } from './http/routes/swap.js';
import { perps } from './http/routes/perps.js';
import { tick as perpTick } from './perp.js';

process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

const port = Number(process.env.PORT ?? 3000);
const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://cdn.jsdelivr.net https://content-api.changenow.io",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://auth.privy.io https://*.privy.io https://cdn.jsdelivr.net https://api.coingecko.com",
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

app.use('/market', market);
app.use('/swap', requireUser, swap);
app.use('/perps', requireUser, perps);

app.use('/results', results);

app.get('/health', async (_req, res) => {
  const h = await health();
  res.status(h.ok ? 200 : 503).json(h);
});

app.get('/.well-known/jwks.json', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.type('application/jwk-set+json').send(jwks());
});

app.use('/auth', auth);
app.use('/auth', walletAuth);
app.use('/webhooks', webhooks);
app.use('/wallet/deposits', requireUser, deposit);
app.use('/wallet', wallet);
app.use('/admin/sql', sqlRouter);
app.use('/admin', adminRouter);

app.get('/me', requireUser, async (req, res) => {
  const u = await one<{ email: string }>(`select email from users where id = $1`, [req.userId]);
  let depositAddress: string | null = null;
  try {
    depositAddress = await ensureDepositAddress(req.userId!);
  } catch (err) {
    console.error('me: deposit address failed', err);
  }
  res.json({ email: u?.email ?? null, depositAddress });
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
    void runSettlement()
      .catch((e) => console.error('settle', e))
      .finally(() => scheduleDailyCredit());
  }, next.getTime() - now.getTime());
}

let dayTimer: NodeJS.Timeout | null = null;

/** Opens the UTC day at 00:00 carrying the previous rate. */
function scheduleDayOpen(): void {
  if (dayTimer) clearTimeout(dayTimer);
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0,
  ));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  dayTimer = setTimeout(() => {
    void ensureToday()
      .catch((e) => console.error('day-open', e))
      .finally(() => scheduleDayOpen());
  }, next.getTime() - now.getTime());
}
if (process.env.NODE_ENV === 'production') {
  const bad: string[] = [];
  if (process.env.PRIVY_NETWORK !== 'mainnet') bad.push(`PRIVY_NETWORK=${process.env.PRIVY_NETWORK}`);
  if (process.env.WEBHOOK_SECRET === undefined || ['dev-webhook', 'devwebhook123456789012345678'].includes(process.env.WEBHOOK_SECRET)) bad.push('WEBHOOK_SECRET is default');
  if (process.env.SESSION_SECRET === undefined || process.env.SESSION_SECRET === 'dev-secret') bad.push('SESSION_SECRET is default');
  if (!process.env.USDC_MINT?.startsWith('EPjFWdd5')) bad.push('USDC_MINT not mainnet USDC');
  if (process.env.RPC_URL?.includes('devnet')) bad.push('RPC_URL is devnet');
  if (process.env.SOLANA_CLUSTER !== 'mainnet-beta') bad.push(`SOLANA_CLUSTER=${process.env.SOLANA_CLUSTER}`);
  if (bad.length) throw new Error(`refusing to boot: ${bad.join(', ')}`);
}
const server = app.listen(port, () => {
  console.log(`listening on ${port}`);

  void assertSweepDestination()
    .then(() => console.log('sweep destination verified'))
    .catch((e) => {
      console.error('sweep-destination', e instanceof Error ? e.message : e);
      process.exit(1);
    });

  every(5 * 1000, perpTick, 'perp-tick');
  every(5 * 60 * 1000, async () => {
    if (await reconDue()) await runRecon('cron');
  }, 'recon');
  every(60 * 60 * 1000, revalueSolDeposits, 'revalue');
  every(60 * 1000, releaseDue, 'vesting');
  every(60 * 1000, expireClaims, 'claims');
  every(60 * 1000, releaseMatured, 'release');
  every(2 * 60 * 1000, pollDeposits, 'deposits');
  every(10 * 60 * 1000, () => runSweep({ dryRun: false, limit: 200 }), 'sweep');
  every(10 * 60 * 1000, watchDeposits, 'deposit-watch');
  every(5 * 60 * 1000, resumeStuckWithdrawals, 'resume');
  every(60 * 1000, payApproved, 'payout');
  every(6 * 60 * 60 * 1000, pruneAuth, 'prune');
  every(6 * 60 * 60 * 1000, refreshRoutes, 'routes');
  void runSettlementIfDue().catch((e) => console.error('settle', e));
  void backfillTrades().catch((e) => console.error('trades', e));
  void ensureToday().catch((e) => console.error('day-open', e));
  void refreshRoutes().catch((e) => console.error('routes', e));
  scheduleDayOpen();
  scheduleDailyCredit();
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    for (const t of timers) clearInterval(t);
    if (dayTimer) clearTimeout(dayTimer);
    if (dailyTimer) clearTimeout(dailyTimer);
    if (dayTimer) clearTimeout(dayTimer);
    if (dailyTimer) clearTimeout(dailyTimer);
    server.close();
    await close();
    process.exit(0);
  });
}
