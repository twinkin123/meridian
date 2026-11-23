-- EVM deposit accounts were issued while only usdc/ethereum was an allowed source,
-- so they cannot route the rest of the pair matrix. No EVM deposit has ever landed,
-- so drop them and let ensureDepositAddresses reissue from the full list.
delete from deposit_addresses where family = 'evm';