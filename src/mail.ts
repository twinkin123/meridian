export type MailResult = { sent: boolean };

// Without a provider key the link is logged, so the flow is testable today.
export async function sendResetMail(to: string, link: string): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail] no provider set, reset link for ${to}: ${link}`);
    return { sent: false };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? 'Quvio <onboarding@resend.dev>',
      to,
      subject: 'Reset your Quvio password',
      text: `Reset your password here:\n\n${link}\n\nThe link works once and expires in 30 minutes.`,
    }),
  });
  if (!res.ok) {
    console.error(`[mail] resend ${res.status}: ${await res.text()}`);
    return { sent: false };
  }
  return { sent: true };
}