SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: account_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_kind AS ENUM (
    'asset',
    'liability',
    'equity',
    'revenue',
    'expense'
);


--
-- Name: deposit_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.deposit_status AS ENUM (
    'detected',
    'credited',
    'held',
    'failed',
    'returned',
    'locked'
);


--
-- Name: owner_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.owner_type AS ENUM (
    'platform',
    'user'
);


--
-- Name: withdrawal_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.withdrawal_status AS ENUM (
    'requested',
    'approved',
    'sending',
    'sent',
    'failed',
    'cancelled'
);


--
-- Name: assert_tx_balanced(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_tx_balanced() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare s bigint;
begin
  select coalesce(sum(amount),0) into s from postings where tx_id = NEW.tx_id;
  if s <> 0 then raise exception 'tx % unbalanced by %', NEW.tx_id, s; end if;
  return null;
end $$;


--
-- Name: block_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin raise exception 'postings are append-only'; end $$;


--
-- Name: ensure_user_accounts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_user_accounts(p_user uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare c text;
begin
  foreach c in array array['2000','2010','2020','2050','2060','2070','2080'] loop
    insert into accounts (code, kind, owner_type, owner_id)
    values (c, 'liability', 'user', p_user)
    on conflict (code, owner_id) do nothing;
  end loop;
end $$;


--
-- Name: post(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.post(p_kind text, p_ref text, p_legs jsonb) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
declare v_tx uuid; v_leg jsonb;
begin
  insert into transactions (kind, external_ref) values (p_kind, p_ref) returning id into v_tx;
  for v_leg in select * from jsonb_array_elements(p_legs) loop
    insert into postings (tx_id, account_id, amount)
    select v_tx, a.id, (v_leg->>'amount')::bigint
    from accounts a
    where a.code = v_leg->>'code'
      and a.owner_id is not distinct from (v_leg->>'owner')::uuid;
  end loop;
  return v_tx;
end $$;


--
-- Name: solvency_margin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.solvency_margin() RETURNS bigint
    LANGUAGE sql STABLE
    AS $$
  select total_client_assets() - total_liabilities()
$$;


--
-- Name: total_client_assets(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.total_client_assets() RETURNS bigint
    LANGUAGE sql STABLE
    AS $$
select coalesce(sum(p.amount), 0)
from postings p join accounts a on a.id = p.account_id
where a.code in ('1000','1010')
$$;


--
-- Name: total_liabilities(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.total_liabilities() RETURNS bigint
    LANGUAGE sql STABLE
    AS $$
select coalesce(sum(-p.amount), 0)
from postings p join accounts a on a.id = p.account_id
where a.kind = 'liability'
$$;


SET default_table_access_method = heap;

--
-- Name: _migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._migrations (
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    kind public.account_kind NOT NULL,
    owner_type public.owner_type NOT NULL,
    owner_id uuid,
    currency text DEFAULT 'USDC'::text NOT NULL,
    CONSTRAINT accounts_check CHECK ((((owner_type = 'platform'::public.owner_type) AND (owner_id IS NULL)) OR ((owner_type = 'user'::public.owner_type) AND (owner_id IS NOT NULL))))
);


--
-- Name: credit_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_runs (
    day date NOT NULL,
    posted integer DEFAULT 0 NOT NULL,
    total bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    rate_bp integer DEFAULT 0 NOT NULL,
    gross_total text,
    fee_total text,
    fee_bp integer DEFAULT 1500 NOT NULL
);


--
-- Name: deposit_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deposit_addresses (
    user_id uuid NOT NULL,
    family text NOT NULL,
    address text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deposit_index_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.deposit_index_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: deposit_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deposit_routes (
    asset text NOT NULL,
    chain text NOT NULL,
    symbol text NOT NULL,
    network text NOT NULL,
    family text NOT NULL,
    fee_pct numeric(12,4),
    viable boolean DEFAULT true NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    rate numeric(30,10)
);


--
-- Name: deposits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deposits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    sig text NOT NULL,
    asset text NOT NULL,
    qty bigint NOT NULL,
    usd_at_det bigint NOT NULL,
    status public.deposit_status DEFAULT 'detected'::public.deposit_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    unlock_at timestamp with time zone,
    released_at timestamp with time zone,
    claim_requested_at timestamp with time zone,
    claim_rejected_at timestamp with time zone,
    claim_reject_reason text,
    stuck_at timestamp with time zone,
    relay_order text,
    relay_fill text,
    CONSTRAINT deposits_asset_check CHECK ((asset = ANY (ARRAY['USDC'::text, 'SOL'::text])))
);


--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempts (
    id bigint NOT NULL,
    ident text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: login_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.login_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: login_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.login_attempts_id_seq OWNED BY public.login_attempts.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone
);


--
-- Name: password_resets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_resets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash bytea NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: postings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.postings (
    id bigint NOT NULL,
    tx_id uuid NOT NULL,
    account_id uuid NOT NULL,
    amount bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT postings_amount_check CHECK ((amount <> 0))
);


--
-- Name: postings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.postings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: postings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.postings_id_seq OWNED BY public.postings.id;


--
-- Name: recon_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recon_runs (
    id bigint NOT NULL,
    chain_sol bigint NOT NULL,
    chain_usdc bigint NOT NULL,
    chain_usd bigint NOT NULL,
    ledger_assets bigint NOT NULL,
    liabilities bigint NOT NULL,
    margin bigint NOT NULL,
    drift bigint NOT NULL,
    stuck integer NOT NULL,
    verdict text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recon_runs_verdict_check CHECK ((verdict = ANY (ARRAY['ok'::text, 'surplus'::text, 'drift'::text, 'insolvent'::text])))
);


--
-- Name: recon_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recon_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recon_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recon_runs_id_seq OWNED BY public.recon_runs.id;


--
-- Name: referral_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period text NOT NULL,
    referrer_id uuid NOT NULL,
    invited integer NOT NULL,
    base_usd bigint NOT NULL,
    rate_bp integer NOT NULL,
    commission_usd bigint NOT NULL,
    tx_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    same_ip boolean DEFAULT false NOT NULL
);


--
-- Name: referral_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_runs (
    period text NOT NULL,
    payouts integer DEFAULT 0 NOT NULL,
    total_usd bigint DEFAULT 0 NOT NULL,
    ran_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash bytea NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ua text,
    ip inet,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: sweeps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sweeps (
    id bigint NOT NULL,
    deposit_address text NOT NULL,
    asset text NOT NULL,
    amount_raw numeric(38,0) NOT NULL,
    destination text NOT NULL,
    signature text,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    CONSTRAINT sweeps_asset_check CHECK ((asset = ANY (ARRAY['SOL'::text, 'USDC'::text]))),
    CONSTRAINT sweeps_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text, 'confirmed'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: sweeps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sweeps_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sweeps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sweeps_id_seq OWNED BY public.sweeps.id;


--
-- Name: system_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_state (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trade_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_days (
    day date NOT NULL,
    rate_bp integer,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trade_days_rate_bp_check CHECK (((rate_bp >= 0) AND (rate_bp <= 10000))),
    CONSTRAINT trade_days_source_check CHECK ((source = ANY (ARRAY['recorded'::text, 'estimated'::text])))
);


--
-- Name: trade_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_results (
    day date NOT NULL,
    seq integer NOT NULL,
    symbol text NOT NULL,
    side text NOT NULL,
    open_px numeric(24,10) NOT NULL,
    close_px numeric(24,10) NOT NULL,
    opened_min integer NOT NULL,
    closed_min integer NOT NULL,
    ret_bp integer NOT NULL,
    CONSTRAINT trade_results_side_check CHECK ((side = ANY (ARRAY['long'::text, 'short'::text])))
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    external_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    pw_hash text NOT NULL,
    deposit_index integer DEFAULT nextval('public.deposit_index_seq'::regclass) NOT NULL,
    deposit_addr text NOT NULL,
    tier smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    referral_code text,
    referred_by uuid,
    is_admin boolean DEFAULT false NOT NULL,
    must_change_pw boolean DEFAULT false NOT NULL,
    referral_paid_at timestamp with time zone,
    privy_wallet_id text,
    privy_address text,
    last_polled_at timestamp with time zone,
    last_deposit_sig text,
    last_swept_at timestamp with time zone,
    last_ata_sig text,
    frozen_at timestamp with time zone,
    frozen_reason text,
    privy_user_id text,
    CONSTRAINT users_tier_check CHECK (((tier >= 0) AND (tier <= 4)))
);


--
-- Name: v_balance; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_balance AS
 SELECT a.owner_id AS user_id,
    a.code,
    COALESCE((- sum(p.amount)), (0)::numeric) AS balance
   FROM (public.accounts a
     LEFT JOIN public.postings p ON ((p.account_id = a.id)))
  WHERE (a.owner_type = 'user'::public.owner_type)
  GROUP BY a.owner_id, a.code;


--
-- Name: vesting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vesting (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    day text NOT NULL,
    amount bigint NOT NULL,
    due_at timestamp with time zone NOT NULL,
    released_at timestamp with time zone
);


--
-- Name: withdrawal_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    address text NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_used timestamp with time zone
);


--
-- Name: withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    asset text NOT NULL,
    address text NOT NULL,
    usd_amount bigint NOT NULL,
    qty_raw bigint,
    status public.withdrawal_status DEFAULT 'requested'::public.withdrawal_status NOT NULL,
    requested_by uuid,
    approved_by text,
    sig text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    fee bigint DEFAULT 0 NOT NULL,
    source text DEFAULT 'available'::text NOT NULL,
    privy_action_id text,
    CONSTRAINT two_person CHECK (((approved_by IS NULL) OR (approved_by <> (requested_by)::text))),
    CONSTRAINT withdrawals_asset_check CHECK ((asset = ANY (ARRAY['SOL'::text, 'USDC'::text]))),
    CONSTRAINT withdrawals_usd_amount_check CHECK ((usd_amount > 0))
);


--
-- Name: login_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts ALTER COLUMN id SET DEFAULT nextval('public.login_attempts_id_seq'::regclass);


--
-- Name: postings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postings ALTER COLUMN id SET DEFAULT nextval('public.postings_id_seq'::regclass);


--
-- Name: recon_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recon_runs ALTER COLUMN id SET DEFAULT nextval('public.recon_runs_id_seq'::regclass);


--
-- Name: sweeps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sweeps ALTER COLUMN id SET DEFAULT nextval('public.sweeps_id_seq'::regclass);


--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (name);


--
-- Name: accounts accounts_code_owner_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_code_owner_id_key UNIQUE NULLS NOT DISTINCT (code, owner_id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: credit_runs credit_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_runs
    ADD CONSTRAINT credit_runs_pkey PRIMARY KEY (day);


--
-- Name: deposit_addresses deposit_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deposit_addresses
    ADD CONSTRAINT deposit_addresses_pkey PRIMARY KEY (user_id, family);


--
-- Name: deposit_routes deposit_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deposit_routes
    ADD CONSTRAINT deposit_routes_pkey PRIMARY KEY (asset, chain);


--
-- Name: deposits deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deposits
    ADD CONSTRAINT deposits_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: password_resets password_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (id);


--
-- Name: password_resets password_resets_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_token_hash_key UNIQUE (token_hash);


--
-- Name: postings postings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postings
    ADD CONSTRAINT postings_pkey PRIMARY KEY (id);


--
-- Name: recon_runs recon_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recon_runs
    ADD CONSTRAINT recon_runs_pkey PRIMARY KEY (id);


--
-- Name: referral_ledger referral_ledger_period_referrer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_ledger
    ADD CONSTRAINT referral_ledger_period_referrer_id_key UNIQUE (period, referrer_id);


--
-- Name: referral_ledger referral_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_ledger
    ADD CONSTRAINT referral_ledger_pkey PRIMARY KEY (id);


--
-- Name: referral_runs referral_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_runs
    ADD CONSTRAINT referral_runs_pkey PRIMARY KEY (period);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: sweeps sweeps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sweeps
    ADD CONSTRAINT sweeps_pkey PRIMARY KEY (id);


--
-- Name: system_state system_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_state
    ADD CONSTRAINT system_state_pkey PRIMARY KEY (key);


--
-- Name: trade_days trade_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_days
    ADD CONSTRAINT trade_days_pkey PRIMARY KEY (day);


--
-- Name: trade_results trade_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_results
    ADD CONSTRAINT trade_results_pkey PRIMARY KEY (day, seq);


--
-- Name: transactions transactions_kind_external_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_kind_external_ref_key UNIQUE (kind, external_ref);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: users users_deposit_addr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_deposit_addr_key UNIQUE (deposit_addr);


--
-- Name: users users_deposit_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_deposit_index_key UNIQUE (deposit_index);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vesting vesting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vesting
    ADD CONSTRAINT vesting_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_addresses withdrawal_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_addresses
    ADD CONSTRAINT withdrawal_addresses_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_addresses withdrawal_addresses_user_id_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_addresses
    ADD CONSTRAINT withdrawal_addresses_user_id_address_key UNIQUE (user_id, address);


--
-- Name: withdrawals withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_pkey PRIMARY KEY (id);


--
-- Name: deposits_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deposits_claim ON public.deposits USING btree (claim_requested_at) WHERE (released_at IS NULL);


--
-- Name: deposits_detected_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deposits_detected_idx ON public.deposits USING btree (created_at) WHERE (status = 'detected'::public.deposit_status);


--
-- Name: deposits_locked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deposits_locked ON public.deposits USING btree (unlock_at) WHERE (released_at IS NULL);


--
-- Name: deposits_relay_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX deposits_relay_uidx ON public.deposits USING btree (relay_order, COALESCE(relay_fill, ''::text)) WHERE (relay_order IS NOT NULL);


--
-- Name: deposits_sig_user_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX deposits_sig_user_uniq ON public.deposits USING btree (sig, user_id);


--
-- Name: deposits_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deposits_user ON public.deposits USING btree (user_id);


--
-- Name: login_attempts_ident; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_attempts_ident ON public.login_attempts USING btree (ident, created_at DESC);


--
-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: password_resets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_resets_user ON public.password_resets USING btree (user_id, created_at DESC);


--
-- Name: postings_acct; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX postings_acct ON public.postings USING btree (account_id, id);


--
-- Name: postings_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX postings_tx ON public.postings USING btree (tx_id);


--
-- Name: recon_runs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recon_runs_created ON public.recon_runs USING btree (created_at DESC);


--
-- Name: referral_ledger_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referral_ledger_ref_idx ON public.referral_ledger USING btree (referrer_id, period);


--
-- Name: sessions_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_live ON public.sessions USING btree (user_id, created_at DESC) WHERE (revoked_at IS NULL);


--
-- Name: sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user ON public.sessions USING btree (user_id);


--
-- Name: sweeps_addr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sweeps_addr_idx ON public.sweeps USING btree (deposit_address, status);


--
-- Name: sweeps_sig_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sweeps_sig_uniq ON public.sweeps USING btree (signature) WHERE (signature IS NOT NULL);


--
-- Name: sweeps_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sweeps_status_idx ON public.sweeps USING btree (status, created_at);


--
-- Name: trade_results_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trade_results_day_idx ON public.trade_results USING btree (day);


--
-- Name: users_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_lower ON public.users USING btree (lower(email));


--
-- Name: users_frozen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_frozen ON public.users USING btree (frozen_at) WHERE (frozen_at IS NOT NULL);


--
-- Name: users_poll_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_poll_idx ON public.users USING btree (last_polled_at NULLS FIRST) WHERE (privy_address IS NOT NULL);


--
-- Name: users_privy_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_privy_address_idx ON public.users USING btree (privy_address) WHERE (privy_address IS NOT NULL);


--
-- Name: users_referral_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_referral_code_key ON public.users USING btree (referral_code);


--
-- Name: users_referred_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_referred_by_idx ON public.users USING btree (referred_by);


--
-- Name: users_sweep_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_sweep_idx ON public.users USING btree (last_swept_at NULLS FIRST) WHERE ((privy_address IS NOT NULL) AND (privy_wallet_id IS NOT NULL));


--
-- Name: vesting_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vesting_due ON public.vesting USING btree (due_at) WHERE (released_at IS NULL);


--
-- Name: withdrawals_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX withdrawals_action_idx ON public.withdrawals USING btree (privy_action_id) WHERE (privy_action_id IS NOT NULL);


--
-- Name: withdrawals_sig; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX withdrawals_sig ON public.withdrawals USING btree (sig) WHERE (sig IS NOT NULL);


--
-- Name: withdrawals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX withdrawals_status ON public.withdrawals USING btree (status, created_at);


--
-- Name: withdrawals_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX withdrawals_user ON public.withdrawals USING btree (user_id, created_at DESC);


--
-- Name: postings postings_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER postings_immutable BEFORE DELETE OR UPDATE ON public.postings FOR EACH ROW EXECUTE FUNCTION public.block_mutation();


--
-- Name: postings tx_balanced; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER tx_balanced AFTER INSERT ON public.postings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.assert_tx_balanced();


--
-- Name: accounts accounts_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: deposit_addresses deposit_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deposit_addresses
    ADD CONSTRAINT deposit_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: deposits deposits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deposits
    ADD CONSTRAINT deposits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: password_resets password_resets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: postings postings_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postings
    ADD CONSTRAINT postings_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: postings postings_tx_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postings
    ADD CONSTRAINT postings_tx_id_fkey FOREIGN KEY (tx_id) REFERENCES public.transactions(id);


--
-- Name: referral_ledger referral_ledger_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_ledger
    ADD CONSTRAINT referral_ledger_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.users(id);


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trade_results trade_results_day_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_results
    ADD CONSTRAINT trade_results_day_fkey FOREIGN KEY (day) REFERENCES public.trade_days(day) ON DELETE CASCADE;


--
-- Name: users users_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.users(id);


--
-- Name: vesting vesting_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vesting
    ADD CONSTRAINT vesting_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: withdrawal_addresses withdrawal_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_addresses
    ADD CONSTRAINT withdrawal_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: withdrawals withdrawals_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: withdrawals withdrawals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--


