import 'dotenv/config';
import { PrivyClient } from '@privy-io/node';
const p = new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
for (const id of ['jsxdvzxn99zfcssh49ew5qvx','jnfzfnh168q9ck6cgyfbxf4k','n3at13ysbndom1bhbx0mnkcn','ufugw1tx6jdx6xnum5j98mtr']) {
  const q: any = await p.keyQuorums().get(id).catch((e: any) => ({ error: e.message }));
  console.log(id, q.error ?? JSON.stringify({ n: q.authorization_keys?.length, keys: q.authorization_keys?.map((k: any) => k.type), threshold: q.authorization_threshold }));
}
