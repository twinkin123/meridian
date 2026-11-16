-- deposit claims need admin approval after maturity

alter table deposits add column if not exists claim_requested_at timestamptz;

create index if not exists deposits_claim on deposits (claim_requested_at) where released_at is null;