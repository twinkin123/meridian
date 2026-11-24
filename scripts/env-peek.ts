console.log(JSON.stringify({
  id: process.env.PRIVY_APP_ID,
  secretLen: process.env.PRIVY_APP_SECRET?.length,
  secretTail: process.env.PRIVY_APP_SECRET?.slice(-6),
  authLen: process.env.PRIVY_AUTH_KEY?.length,
  dbIsPublic: process.env.DATABASE_URL?.includes('turntable'),
}, null, 1));