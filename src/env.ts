import 'dotenv/config';

function need(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
}

export const env = {
  isTest: process.env.NODE_ENV === 'test',
  databaseUrl:
    process.env.NODE_ENV === 'test' ? need('TEST_DATABASE_URL') : need('DATABASE_URL'),
  masterMnemonic: need('MASTER_MNEMONIC'),
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-secret',
};