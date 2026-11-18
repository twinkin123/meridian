# Handoff

Written 2026-11-18. Read this before touching anything.

## State

Platform is live and stable. Ledger balanced (0 unbalanced transactions). Books match
chain to about a cent.

- Chain: ~$280.44 (250 USDC + ~0.40 SOL at treasury)
- Owed to users: $53.73
- Real headroom: ~$226.71
- Freeze level: 0
- Deposits: frozen at detection value by design; see "Valuation model"

Do not run ad-hoc SQL against the ledger without reading "Ledger conventions" first.

## Treasury

`29rKW5j1YAhRxWEjPT2KHQngAqySUpfC89ZscSBQFpaK` - note the uppercase W. A lowercase-w
variant is a different, empty address and has caused a false alarm before.

Two keys with different jobs:

- `PRIVY_TREASURY_WALLET_ID` = `xcgp4s5cmajvxgy4qdycbvo0` signs payouts via transferFrom.
- `MASTER_MNEMONIC` at `m/44'/501'/999999'/0'` = `Adjv4EWpMqAoUuCkwsNq7mdYTeUqKthkMWMUoiL8vFaK`
  holds ~0.063 SOL and is only a fee payer for ATA creation and float top-ups.

The treasury wallet has NO owner, so Privy will not export its key. Assigning an
owner changes its authorization config - test a transfer afterwards.

`SWEEP_DESTINATION` must always equal the address of `PRIVY_TREASURY_WALLET_ID`.
Nothing enforces this. An assertion at boot would.

## Valuation model

Deposit values are fixed at detection. Market moves are the platform's P&L, not the
user's. `drift` is therefore unrealised P&L, not a books error; the alarm threshold
scales at 10% of liabilities (floor $2) via `DRIFT_FREEZE_BP`.

`src/jobs/revalue.ts` only corrects bad detections: rows under 6h old deviating more
than 20% from market. It will not chase price.

## Open work, in order

1. Shard the Helius webhook. 24 of 25 addresses used, 54 users, so 30 users are
   poller-only at 15-minute latency.
2. `GET /wallet/deposits` history endpoint.
3. Tests and CI, before more code lands.
4. Housekeeping, last.

## Housekeeping (do at the very end, not before)

- Rotate `ADMIN_TOKEN`, `WEBHOOK_SECRET`, `SESSION_SECRET`, `PRIVY_APP_SECRET`,
  `PRIVY_AUTH_KEY`, `MASTER_MNEMONIC`, and the DB password. All are in the
  2026-11-17/18 session transcript in plaintext.
- Remove `src/admin-sql.ts`, its two lines in `src/index.ts`, and `SQL_TOKEN`.
- Put the repo back to private.
- Remove `scripts/export-treasury.ts` and `scripts/export-privy.ts` once the
  treasury rotation is done.
- Railway trial has ~$4.17 left. Top up before a working session, not during one.

## Ledger conventions

- `v_balance.balance = -sum(postings)` per account.
- Platform accounts: 1000/1010/1020 asset, 3000 equity, 4000 revenue, 5010 expense.
- User accounts 2000/2010/2020/2050/2060/2070/2080 are all liability.
- 2000 available, 2050 held, 2070 locked, 2010 in-flight withdrawal.
- `total_client_assets()` sums 1000/1010; `total_liabilities()` sums all liability.
- `solvency_margin() = assets - liabilities`. Negative margin freezes at level 2.
- Postings are immutable; transactions must net to zero (deferred trigger).
- Manual corrections need a balanced transaction with a unique `external_ref`.

## Freeze levels

0 normal, 1 drift alarm, 2 insolvent. Level 2 halts the daily credit job. The level
only ratchets up during recon - it never lowers itself, clear it manually.

## Housekeeping traps hit already

- `Set-Content -Encoding UTF8` writes a BOM and breaks migrations. Use
  `[System.IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding($false)))`.
- PowerShell mangles JSON passed to `curl.exe`. Use `Invoke-RestMethod` with
  `ConvertTo-Json`.
- psql pages long output and silently swallows the next command. Always pass
  `-P pager=off`.