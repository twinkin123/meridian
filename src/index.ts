import { createServer } from 'node:http';
import { health } from './http/health.js';
import { close } from './db.js';

const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (req, res) => {
  if ((req.url ?? '/') === '/health') {
    const h = await health();
    res.writeHead(h.ok ? 200 : 503, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(h));
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, () => console.log(`listening on ${port}`));

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    server.close();
    await close();
    process.exit(0);
  });
}
