import { readFileSync, writeFileSync } from 'node:fs';
const f = 'public/admin.html';
let s = readFileSync(f, 'utf8');
function rep(a, b) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('want 1, got ' + n + ' :: ' + a.slice(0, 60));
  s = s.split(a).join(b);
}
rep('<span class="mono">Deposit claims</span>', '<span class="mono">Stake claims</span>');
rep('<button data-sort="deposited" type="button">Deposited</button>', '<button data-sort="deposited" type="button">Staked</button>');
rep('dep</span>', 'staked</span>');
writeFileSync(f, s);
console.log('stake wording done');
