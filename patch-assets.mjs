import { readFileSync, writeFileSync } from 'node:fs';
const p = 'src/http/routes/deposit.ts';
let s = readFileSync(p, 'utf8');

const from = "deposit.get('/assets', async (_req, res) => {\n  res.json({ routes: await viableRoutes(), min: MIN_USD });\n});";
if (!s.includes(from)) throw new Error('ANCHOR MISS assets');
const to = `deposit.get('/assets', async (_req, res) => {
  const allowed = new Set(
    env.depositChains.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
  );
  const routes = (await viableRoutes()).filter((r) => !allowed.size || allowed.has(r.chain));
  res.json({ routes, min: MIN_USD });
});`;
s = s.replace(from, to);

if (!s.includes("from '../../env.js'")) {
  const i = s.indexOf("import { MIN_USD");
  if (i < 0) throw new Error('ANCHOR MISS import');
  s = s.slice(0, i) + "import { env } from '../../env.js';\n" + s.slice(i);
}

writeFileSync(p, s);
console.log('patched');
