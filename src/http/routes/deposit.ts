import { Router } from 'express';
import QRCode from 'qrcode';
import { pool } from '../../db.js';
import { ensureDepositAddress } from '../../deposits.js';

export const deposit = Router();

deposit.get('/', async (req, res) => {
  const userId = (req as any).userId ?? (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'unauth' });

  const address = await ensureDepositAddress(userId);
  const qr = await QRCode.toDataURL(address, {
    margin: 1,
    width: 320,
    color: { dark: '#0e0b16', light: '#ffffff' },
  });

  const recent = await pool.query<{ usd: string }>(
    `select coalesce(sum(amount), 0) usd from postings p
       join transactions t on t.id = p.tx_id
      where p.code = '2000' and p.owner = $1 and t.created_at > now() - interval '30 minutes'`,
    [userId],
  );

  res.json({ address, qr, received: recent.rows[0]?.usd ?? '0' });
});