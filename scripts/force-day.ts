import { tx } from '../src/db.js';
import { recordDay } from '../src/trades.js';

const day = '2026-11-24';
const bp = Number(process.argv[2] ?? 227);

await tx((c) => recordDay(c, day, bp));
console.log(day + ' rewritten at ' + bp + ' bp');
process.exit(0);