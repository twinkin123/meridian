import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/* Guards the shape of the migrations directory. The schema dump diff in ci.yml
   catches drift from production; this catches the branch accidents that make a
   migration set unusable on its own: gaps, duplicate numbers, renames. */
const dir = join(process.cwd(), 'migrations');

async function main() {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const errors: string[] = [];

  if (files.length === 0) errors.push('no migrations found');

  files.forEach((f, i) => {
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(f)) {
      errors.push(`${f}: name must be NNNN_snake_case.sql`);
      return;
    }
    const want = String(i + 1).padStart(4, '0');
    if (f.slice(0, 4) !== want) {
      errors.push(`${f}: expected ${want}, found ${f.slice(0, 4)} (gap or duplicate)`);
    }
  });

  if (errors.length) {
    console.error('migration check failed:');
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  console.log(`ok: ${files.length} migrations, contiguous to ${files[files.length - 1]}`);
}

main().catch((e) => { console.error(e); process.exit(1); });