/** Registers deposit addresses on the Helius webhook. Serialised so concurrent signups cannot clobber the list. */
const API = 'https://api.helius.xyz/v0/webhooks';

type Hook = {
  webhookURL?: string;
  webhookType?: string;
  transactionTypes?: string[];
  accountAddresses?: string[];
};

let queue: Promise<unknown> = Promise.resolve();

function serialise<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export function addAddress(address: string): Promise<void> {
  const id = process.env.HELIUS_WEBHOOK_ID;
  const key = process.env.HELIUS_API_KEY;
  if (!id || !key) return Promise.resolve();

  return serialise(async () => {
    const base = `${API}/${id}?api-key=${key}`;
    const get = await fetch(base);
    if (!get.ok) throw new Error(`helius_get_${get.status}`);
    const hook = (await get.json()) as Hook;

    const list = new Set(hook.accountAddresses ?? []);
    if (list.has(address)) return;
    list.add(address);

    const put = await fetch(base, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        webhookURL: hook.webhookURL,
        webhookType: hook.webhookType ?? 'enhanced',
        transactionTypes: hook.transactionTypes ?? ['TRANSFER'],
        accountAddresses: [...list],
        authHeader: process.env.WEBHOOK_SECRET,
      }),
    });
    if (!put.ok) throw new Error(`helius_put_${put.status}`);
  });
}