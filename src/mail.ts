import { env } from './env.js';

export type MailResult = { sent: boolean; error?: string };

type Mail = { to: string; subject: string; text: string; tag?: string; replyTo?: string };

const ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 8_000;

/** One attempt. Returns the status so the caller can decide about a retry. */
async function attempt(mail: Mail, key: string): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.mailFrom,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      ...(mail.tag ? { tags: [{ name: 'kind', value: mail.tag }] } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { ok: res.ok, status: res.status, body: res.ok ? '' : await res.text().catch(() => '') };
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const key = env.resendApiKey;
  if (!key) {
    console.log(`[mail] no RESEND_API_KEY, skipping ${mail.tag ?? 'mail'} to ${mail.to}`);
    return { sent: false, error: 'no_key' };
  }

  try {
    let out = await attempt(mail, key);
    // the free tier is 100/day; a burst trips the limiter, so back off once
    if (out.status === 429) {
      await new Promise((r) => setTimeout(r, 1_200));
      out = await attempt(mail, key);
    }
    if (!out.ok) {
      console.error(`[mail] resend ${out.status} for ${mail.tag ?? 'mail'} to ${mail.to}: ${out.body}`);
      return { sent: false, error: `resend_${out.status}` };
    }
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'send_failed';
    console.error(`[mail] ${mail.tag ?? 'mail'} to ${mail.to} threw: ${msg}`);
    return { sent: false, error: msg };
  }
}

export async function sendResetMail(to: string, link: string): Promise<MailResult> {
  const out = await sendMail({
    to,
    tag: 'password_reset',
    subject: 'Reset your Quvio password',
    replyTo: 'support@quvio.io',
    text: [
      'Reset your password here:',
      '',
      link,
      '',
      'The link works once and expires in 30 minutes.',
      '',
      `If you did not ask for this, ignore it. Sign in: ${env.publicBaseUrl || 'https://www.quvio.io'}/auth.html`,
    ].join('\n'),
  });
  if (!out.sent) console.log(`[mail] reset link for ${to}: ${link}`);
  return out;
}
export async function sendWelcomeMail(to: string): Promise<MailResult> {
  return sendMail({
    to,
    tag: 'welcome',
    subject: 'Your Quvio account is open',
    replyTo: 'support@quvio.io',
    text: [
      'Your account is open and your deposit address is on the dashboard.',
      '',
      'Send at least $10 in USDC or SOL to that address and it credits once confirmed. Every deposit locks for 30 days and earns a daily credit from 1% to 4%.',
      '',
      `Dashboard: ${env.publicBaseUrl || 'https://www.quvio.io'}/app.html`,
      '',
      'Deposits sent on another network are not recoverable, so check you are on Solana before you send.',
    ].join('\n'),
  });
}