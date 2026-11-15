import express from 'express';
import cookieParser from 'cookie-parser';
import { health } from './http/health.js';
import { auth } from './http/routes/auth.js';
import { webhooks } from './http/routes/webhooks.js';
import { adminRouter } from './admin.js';
import { requireUser } from './http/mw/session.js';
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
app.use('/admin', adminRouter);

app.get('/me', requireUser, async (req, res) => {
  const u = await one<{ email: string; deposit_addr: string }>(
    'select email, deposit_addr from users where id = $1',
    [req.userId],
  );
  res.json({ email: u.email, depositAddress: u.deposit_addr });
});

const server = app.listen(port, () => console.log(`listening on ${port}`));

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    server.close();
    await close();
    process.exit(0);
  });
}