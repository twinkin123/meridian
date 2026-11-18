import { env } from '../../env.js';
﻿import { Router } from 'express';
import QRCode from 'qrcode';
import { pool } from '../../db.js';
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

deposit.get('/', async (req, res) => {
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
