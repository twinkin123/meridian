# Handoff

Rewritten 2026-11-24 after the go-live reset. Read this before touching anything.

## State

Fresh launch. All pre-launch users and balances were wiped on 2026-11-24; the only
ledger activity since is test traffic from a few throwaway accounts.

- Chain: ~2.8 SOL + ~20.53 USDC at treasury
- Owed to users: ~$199.53
- Freeze level: 0

Most test deposits were funded *from* the treasury, so the same money keeps arriving
back and the collateral gap closes only slowly. Only real external deposits fix it.
Do not read the margin as surplus.

Do not run ad-hoc SQL against the ledger without reading "Ledger conventions" first.

## Treasury

`ATXNNy1st7V8Lv3gDnSdcEbKgb3VopuxAH9zw7so8Mhe`

- `PRIVY_TREASURY_WALLET_ID` = `pn32naflx3br0mxip5qn5rcy`, owned by the authorization
  key quorum `quvio-server`.
- `MASTER_MNEMONIC` at `m/44'/501'/999999'/0'` =
  `7rqHqUTXr8VPrUHEdmtTDikeqaxd1LH4EiSdtqeW2KuP` is the fee payer for sweeps and
  float top-ups. Keep it funded or every sweep fails.
- `SWEEP_DESTINATION` must equal the treasury address. `assertSweepDestination()`
  checks it at boot and kills the process on mismatch.

## Privy

App `cmwu1kx7y00bd0gjyj25876qe`, production, JWT auth provider registered against
`https://www.quvio.io/.well-known/jwks.json` with issuer `quvio`. Server-side calls on
user-owned wallets mint a 5-minute ES256 user JWT from `PRIVY_AUTH_KEY`.

If JWT auth is disabled in the dashboard, every user-owned wallet call fails 401 with
"External auth providers are not enabled for your account" and EVM address issuance
silently stops.

`createCryptoDepositAccount` issues one EVM address per user, shared across all seven
EVM chains in `DEPOSIT_CHAINS`. EVM forwards need Privy gas sponsorship credits.

## Deposit model

Deposits credit straight to available (2000), marked `credited` with a null
`unlock_at`. Nothing auto-stakes. The user stakes from available; `stake()` moves
2000 -> 2070 and sets a 30-day lock on the stake row.

2050 (reserve) is used only while the freeze is at level 1 or above. Clearing the
freeze to 0 runs `releaseAllReserves()`, which moves every reserve balance back to
available and notifies each user.

## Valuation model

Deposit values are fixed at detection. Market moves are the platform's P&L, not the
user's. `drift` is unrealised P&L, not a books error. `verdictFor` reports `insolvent`
when `solvency_margin()` goes negative, `drift` past `driftThreshold()`, `surplus`
past it the other way.

Margin is a ledger figure: it compares asset postings on 1000/1010 against all
liabilities. Daily credits post against 5010 expense, not assets, so margin falls
every day a credit runs regardless of what the treasury holds. Treat it as
bookkeeping, not as coverage of the chain balance.

`src/jobs/revalue.ts` only corrects bad detections: rows under 6h old deviating more
than 20% from market. It posts the delta to 2070 for locked rows, 2000 otherwise.

## Freeze levels

Levels are set by an operator only. Recon computes a suggestion, returns it as
`frozen`, and never writes `system_state`.

- 0 normal
- 1 no new 30-day locks; deposits park in reserve
- 2 also stops withdrawals leaving

Daily credit and referral rewards always run. At level 1 compounding holds off so the
credit vests instead of extending a lock — the money still arrives.

## Withdrawal rules

A payout may not exceed 15% of the treasury balance (`TREASURY_SHARE_PCT`), and the
treasury must actually hold it. First-time addresses always queue for manual approval.

## Open work, in order

1. Fund Privy sponsorship credits. EVM forwards fail without them.
2. Tests and CI, before more code lands.
3. A real external deposit from a non-treasury wallet.
4. Decide whether insolvency should key off chain coverage rather than ledger margin.

## Outstanding housekeeping

- Delete the Helius webhook on the previous account.
- Delete the dead Privy secrets ending `...DUtb` and `...UoMxAh`.
- Sweep ~0.015 SOL off old treasury `29rKW5j1YAhRxWEjPT2KHQngAqySUpfC89ZscSBQFpaK`
  via the old Privy app.
- Delete the stray Railway variable `re_WRbP6Pjw_T7XgdQbNFwsdMQndzeqECz29`; the real
  value lives in `RESEND_API_KEY`.
- Top up Railway before a long session, not during one.

## Ledger conventions

- `v_balance.balance = -sum(postings)` per account.
- Platform accounts: 1000/1010/1020 asset, 3000 equity, 4000 revenue, 5010 expense.
- User accounts 2000/2010/2020/2050/2060/2070/2080 are all liability.
- 2000 available, 2010 in-flight withdrawal, 2050 reserve (freeze only), 2070 locked.
- `total_client_assets()` sums 1000/1010; `total_liabilities()` sums all liability.
- `solvency_margin() = assets - liabilities`.
- Postings are immutable; transactions must net to zero (deferred trigger).
- Manual corrections need a balanced transaction with a unique `external_ref`.

## Housekeeping traps hit already

- `Set-Content -Encoding UTF8` writes a BOM and breaks migrations. Use
  `[System.IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding($false)))`.
- PowerShell mangles JSON passed to `curl.exe`. Use `Invoke-RestMethod` with
  `ConvertTo-Json`.
- psql pages long output and silently swallows the next command. Always pass
  `-P pager=off`.
- Here-strings produce CRLF and break `.Replace` against LF files. Use `-replace` with
  a regex, or normalise the here-string first.
- Double-quoted PowerShell strings interpolate `$10` and `${have}`. Use single-quoted
  here-strings for anything containing `$`.