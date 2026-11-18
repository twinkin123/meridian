import { Router } from 'express';
import QRCode from 'qrcode';
import { pool } from '../../db.js';
import { ensureDepositAddress } from '../../deposits.js';

export const deposit = Router();

deposit.get('/', async (req, res) => {
  const userId = req.userId!;

  let address: string | null = null;
  try {
    address = await ensureDepositAddress(userId);
  } catch (err) {
    console.error('deposit: address', err);
  }
  if (!address) return res.status(503).json({ error: 'address_unavailable' });

  const qr = await QRCode.toDataURL(address, {
    margin: 1,
    width: 320,
    color: { dark: '#0e0b16', light: '#ffffff' },
  });

  const { rows } = await pool.query<{ id: string; usd: string; status: string; asset: string }>(
    `select id, usd_at_det usd, status, asset from deposits
      where user_id = $1 order by created_at desc limit 5`,
    [userId],
  );

  res.json({
    address,
    qr,
    latest: rows[0]
      ? { id: rows[0].id, asset: rows[0].asset, usd: rows[0].usd, status: rows[0].status }
      : null,
  });
});
