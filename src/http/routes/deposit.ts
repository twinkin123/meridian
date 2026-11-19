import { env } from '../../env.js';
import { Router } from 'express';
import QRCode from 'qrcode';
import { one, pool } from '../../db.js';
import { quoteDeposit } from '../../privy.js';
import { ensureDepositAddresses } from '../../deposits.js';
import { MIN_USD, refreshRoutes, viableRoutes } from '../../deposit-routes.js';

const QR = { margin: 1, width: 320, color: { dark: '#0e0b16', light: '#ffffff' } };

export const deposit = Router();

deposit.get('/assets', async (_req, res) => {
  const allowed = new Set(
    env.depositChains.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
  );
  const routes = (await viableRoutes()).filter((r) => r.family === 'sol' || allowed.has(r.chain));
  res.json({ routes, min: MIN_USD });
});

deposit.post('/refresh', async (_req, res) => {
  void refreshRoutes();
  res.json({ started: true });
});

/* Indicative conversion for the selected route. amount is in source-asset units. */
deposit.get('/quote', async (req, res) => {
  const asset = String(req.query.asset ?? '');
  const chainName = String(req.query.chain ?? '').toLowerCase();
  const amount = String(req.query.amount ?? '');
  if (!asset || !chainName || !amount) return res.status(400).json({ error: 'bad_quote' });
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'bad_amount' });
  }

  const allowed = new Set(
    env.depositChains.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
  );
  const route = await one<{ rate: string | null; family: string; chain: string }>(
    'select rate, family, chain from deposit_routes where asset = $1 and chain = $2 and viable',
    [asset, chainName],
  );
  if (!route) return res.status(404).json({ error: 'unknown_route' });
  if (route.family !== 'sol' && !allowed.has(route.chain)) {
    return res.status(404).json({ error: 'gated_chain' });
  }

  const q = await quoteDeposit(asset, chainName, amount);
  if (!q) return res.status(502).json({ error: 'no_quote' });
  res.json({ input: q.input, output: q.output, rate: route.rate });
});

deposit.get('/address', async (req, res) => {
  const userId = req.userId!;
  let addrs: Record<string, string>;
  try {
    addrs = await ensureDepositAddresses(userId);
  } catch (err) {
    console.error('deposit: address', err);
    return res.status(503).json({ error: 'address_unavailable' });
  }

  const addresses = [];
  for (const [family, address] of Object.entries(addrs)) {
    addresses.push({ family, address, qr: await QRCode.toDataURL(address, QR) });
  }

  const { rows } = await pool.query<{ id: string; usd: string; status: string; asset: string }>(
    `select id, usd_at_det usd, status, asset from deposits
      where user_id = $1 order by created_at desc limit 5`,
    [userId],
  );

  res.json({
    address: addrs.sol,
    qr: addresses.find((a) => a.family === 'sol')?.qr ?? null,
    addresses,
    latest: rows[0]
      ? { id: rows[0].id, asset: rows[0].asset, usd: rows[0].usd, status: rows[0].status }
      : null,
  });
});