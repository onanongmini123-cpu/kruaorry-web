-- 058: Kru Aorry AI Accounting Department — core schema (PENDING, NOT APPLIED).
--
-- Review before applying; check against the live ledger first (see README.md).
--
-- Privacy design:
--   * Everything lives in a dedicated `accounting` schema that is NOT added to
--     the PostgREST exposed schemas, so the public API cannot reach it.
--   * anon/authenticated get no grants except the owner-only RLS path below;
--     the LINE webhook should use the service role from server-side code only.
--   * RLS is enabled on every table; the only policy allows public.is_owner().
--   * Approved/posted rows are immutable; corrections go through new rows.
--   * Every insert/update/delete is written to accounting.audit_log.
--   * Real data vs. simulated data is separated by `is_simulated`.
--
-- Chart of accounts: 1000 assets, 2000 liabilities, 3000 equity, 4000 revenue,
-- 5000 COGS, 6000 expenses, 7000 other income, 8000 other expenses.

create schema if not exists accounting;
revoke all on schema accounting from public, anon, authenticated;
grant usage on schema accounting to authenticated;

create type accounting.txn_status as enum ('pending','approved','rejected','voided');
create type accounting.txn_type as enum ('income','expense','transfer','adjustment');
create type accounting.channel as enum ('kruaorry_com','facebook_vip','digital_products','other');
create type accounting.account_type as enum
  ('asset','liability','equity','revenue','cogs','expense','other_income','other_expense');

-- Reference-code generator: PREFIX-YYYYMM-000001
create sequence accounting.ref_seq;
create function accounting.next_ref(prefix text) returns text
language sql volatile set search_path = '' as $$
  select prefix || '-' || to_char(now() at time zone 'Asia/Bangkok','YYYYMM')
         || '-' || lpad(nextval('accounting.ref_seq')::text, 6, '0');
$$;

-- Common columns are repeated per table for clarity.

-- 6. Accounts (chart of accounts)
create table accounting.accounts (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default accounting.next_ref('ACC'),
  code int not null unique check (code between 1000 and 8999),
  name text not null,
  type accounting.account_type not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (type = 'asset' and code between 1000 and 1999) or
    (type = 'liability' and code between 2000 and 2999) or
    (type = 'equity' and code between 3000 and 3999) or
    (type = 'revenue' and code between 4000 and 4999) or
    (type = 'cogs' and code between 5000 and 5999) or
    (type = 'expense' and code between 6000 and 6999) or
    (type = 'other_income' and code between 7000 and 7999) or
    (type = 'other_expense' and code between 8000 and 8999)
  )
);

-- 3. Customers
create table accounting.customers (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default accounting.next_ref('CUS'),
  name text not null,
  contact text,
  member_id uuid,                       -- optional link to public.profiles.id
  created_at timestamptz not null default now()
);

-- 4. Products
create table accounting.products (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default accounting.next_ref('PRD'),
  name text not null,
  channel accounting.channel not null,
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 1. Transactions (the pending/approved ledger of business events)
create table accounting.transactions (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default accounting.next_ref('TXN'),
  occurred_at timestamptz not null,
  type accounting.txn_type not null,
  channel accounting.channel,
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null default 'THB',
  account_id uuid references accounting.accounts(id),
  payment_method text,                  -- cash / bank transfer / PromptPay / card ...
  description text not null,
  status accounting.txn_status not null default 'pending',
  source text not null default 'line',  -- line / manual / import
  dedupe_key text unique,               -- hash(date, amount, description, source msg id)
  is_simulated boolean not null default false,
  recorded_by text not null,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('approved','voided')) = (approved_by is not null and approved_at is not null))
);
create index on accounting.transactions (status, occurred_at desc);

-- 2. Sales
create table accounting.sales (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default accounting.next_ref('SAL'),
  transaction_id uuid references accounting.transactions(id),
  customer_id uuid references accounting.customers(id),
  product_id uuid references accounting.products(id),
  channel accounting.channel not null,
  quantity int not null default 1 check (quantity > 0),
  gross_amount numeric(14,2) not null check (gross_amount >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  refunded numeric(14,2) not null default 0 check (refunded >= 0),
  amount_received numeric(14,2) not null default 0 check (amount_received >= 0),
  sold_at timestamptz not null,
  status accounting.txn_status not null default 'pending',
  is_simulated boolean not null default false,
  created_at timestamptz not null default now()
);

-- 5. Expenses
create table accounting.expenses (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default accounting.next_ref('EXP'),
  transaction_id uuid references accounting.transactions(id),
  category text not null,               -- software / ads / equipment / fees ...
  vendor text,
  amount numeric(14,2) not null check (amount > 0),
  vat_amount numeric(14,2) not null default 0 check (vat_amount >= 0),
  is_recurring boolean not null default false,
  paid_at timestamptz,
  status accounting.txn_status not null default 'pending',
  is_simulated boolean not null default false,
  created_at timestamptz not null default now()
);

-- 7. Journal entries (header) + lines (double entry)
create table accounting.journal_entries (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default accounting.next_ref('JE'),
  transaction_id uuid references accounting.transactions(id),
  entry_date date not null,
  memo text not null,
  status accounting.txn_status not null default 'pending',
  is_simulated boolean not null default false,
  reverses_id uuid references accounting.journal_entries(id),
  created_at timestamptz not null default now()
);
create table accounting.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references accounting.journal_entries(id) on delete restrict,
  account_id uuid not null references accounting.accounts(id),
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  check ((debit > 0) <> (credit > 0))
);
create index on accounting.journal_lines (entry_id);

-- 8. Payments
create table accounting.payments (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default accounting.next_ref('PAY'),
  sale_id uuid references accounting.sales(id),
  expense_id uuid references accounting.expenses(id),
  direction text not null check (direction in ('in','out')),
  amount numeric(14,2) not null check (amount > 0),
  method text not null,
  paid_at timestamptz not null,
  bank_reference text,
  reconciled boolean not null default false,
  status accounting.txn_status not null default 'pending',
  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  check ((sale_id is not null) <> (expense_id is not null))
);

-- 9. Subscriptions (accounting view; deferred revenue handled by journal entries)
create table accounting.subscriptions (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default accounting.next_ref('SUB'),
  customer_id uuid references accounting.customers(id),
  product_id uuid references accounting.products(id),
  sale_id uuid references accounting.sales(id),
  period_start date not null,
  period_end date not null,
  amount numeric(14,2) not null check (amount >= 0),
  renewal_of uuid references accounting.subscriptions(id),
  status accounting.txn_status not null default 'pending',
  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  check (period_end > period_start)
);

-- 10. Tax records (data collection only; deductibility is never assumed)
create table accounting.tax_records (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default accounting.next_ref('TAX'),
  transaction_id uuid references accounting.transactions(id),
  tax_type text not null check (tax_type in ('vat_input','vat_output','withholding','income_tax')),
  base_amount numeric(14,2) not null,
  tax_amount numeric(14,2) not null,
  doc_number text,
  deductible_verified boolean not null default false,
  due_date date,
  status accounting.txn_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- 11. Evidence (files live in a PRIVATE storage bucket; store path only)
create table accounting.evidence (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default accounting.next_ref('EVD'),
  transaction_id uuid references accounting.transactions(id),
  kind text not null check (kind in ('receipt','slip','invoice','tax_invoice','other')),
  storage_path text not null,           -- bucket `accounting-evidence` (private)
  sha256 text not null,
  uploaded_at timestamptz not null default now()
);
create index on accounting.evidence (sha256);

-- 12. Approvals
create table accounting.approvals (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default accounting.next_ref('APR'),
  transaction_id uuid not null references accounting.transactions(id),
  decision text not null check (decision in ('approved','rejected')),
  decided_by uuid not null,
  decided_at timestamptz not null default now(),
  note text
);

-- Audit log (append-only)
create table accounting.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null default coalesce(auth.uid()::text, current_user),
  table_name text not null,
  row_id text,
  action text not null,
  old_row jsonb,
  new_row jsonb
);

-- Immutability of approved rows (BEFORE, so it fires ahead of FK checks)
create function accounting.guard_approved() returns trigger
language plpgsql set search_path = '' as $$
declare r_old jsonb := to_jsonb(old);
        r_new jsonb := case when tg_op = 'UPDATE' then to_jsonb(new) end;
begin
  if r_old->>'status' in ('approved','voided') then
    -- approved rows may only move to voided; never deleted, never edited
    if tg_op = 'DELETE' or r_new->>'status' <> 'voided'
       or (r_old - 'status' - 'updated_at') <> (r_new - 'status' - 'updated_at') then
      raise exception 'approved accounting rows are immutable (%.%)', tg_table_name, r_old->>'ref';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Audit trail
create function accounting.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        r_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  insert into accounting.audit_log (table_name, row_id, action, old_row, new_row)
  values (tg_table_name, coalesce(r_new->>'id', r_old->>'id'), tg_op, r_old, r_new);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['transactions','sales','customers','products','expenses','accounts',
    'journal_entries','journal_lines','payments','subscriptions','tax_records','evidence','approvals']
  loop
    if t in ('transactions','sales','expenses','journal_entries','payments','subscriptions','tax_records') then
      execute format('create trigger guard_%1$s before update or delete on accounting.%1$s
                      for each row execute function accounting.guard_approved()', t);
    end if;
    execute format('create trigger audit_%1$s after insert or update or delete on accounting.%1$s
                    for each row execute function accounting.audit_row()', t);
  end loop;
end $$;

-- audit_log is append-only
create function accounting.deny_audit_change() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'audit_log is append-only'; end $$;
create trigger audit_log_append_only before update or delete on accounting.audit_log
  for each row execute function accounting.deny_audit_change();

-- Balanced journal entries: debits = credits before an entry can be approved
create function accounting.check_entry_balanced() returns trigger
language plpgsql set search_path = '' as $$
declare d numeric; c numeric;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select coalesce(sum(debit),0), coalesce(sum(credit),0) into d, c
      from accounting.journal_lines where entry_id = new.id;
    if d = 0 or d <> c then
      raise exception 'journal entry % is not balanced (debit %, credit %)', new.ref, d, c;
    end if;
  end if;
  return new;
end $$;
create trigger journal_entries_balanced before insert or update on accounting.journal_entries
  for each row execute function accounting.check_entry_balanced();

-- Lines of an approved entry cannot change
create function accounting.lock_lines() returns trigger
language plpgsql set search_path = '' as $$
declare s accounting.txn_status;
begin
  select status into s from accounting.journal_entries
    where id = coalesce(new.entry_id, old.entry_id);
  if s in ('approved','voided') then
    raise exception 'cannot change lines of an approved journal entry';
  end if;
  return coalesce(new, old);
end $$;
create trigger journal_lines_lock before insert or update or delete on accounting.journal_lines
  for each row execute function accounting.lock_lines();

-- updated_at
create function accounting.touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger transactions_touch before update on accounting.transactions
  for each row execute function accounting.touch();

-- Owner-only RLS on every table + minimal grants
do $$
declare t text;
begin
  foreach t in array array['transactions','sales','customers','products','expenses','accounts',
    'journal_entries','journal_lines','payments','subscriptions','tax_records','evidence',
    'approvals','audit_log']
  loop
    execute format('alter table accounting.%I enable row level security', t);
    execute format('alter table accounting.%I force row level security', t);
    execute format('create policy owner_select on accounting.%I for select to authenticated
                    using ((select public.is_owner()))', t);
    execute format('grant select on accounting.%I to authenticated', t);
  end loop;
  -- Owner may only decide approvals / create rows through server code (service role).
  -- No insert/update/delete grants for authenticated: writes happen in the LINE
  -- webhook (service role) and approval RPCs, never from the browser.
end $$;
grant usage, select on sequence accounting.ref_seq to authenticated;

-- Seed chart of accounts (structure only; no financial figures)
insert into accounting.accounts (code, name, type) values
  (1000,'Cash & Bank','asset'),
  (1100,'Accounts Receivable','asset'),
  (2000,'Accounts Payable','liability'),
  (2100,'Deferred Revenue (รายได้รับล่วงหน้า)','liability'),
  (2200,'Withholding Tax Payable','liability'),
  (2300,'VAT Payable','liability'),
  (3000,'Owner Equity','equity'),
  (4000,'Revenue - KruAorry.com','revenue'),
  (4100,'Revenue - Facebook VIP','revenue'),
  (4200,'Revenue - Digital Products','revenue'),
  (5000,'Cost of Goods Sold','cogs'),
  (6000,'Software & Subscriptions','expense'),
  (6100,'Advertising','expense'),
  (6200,'Office & Equipment','expense'),
  (6300,'Payment & Platform Fees','expense'),
  (7000,'Other Income','other_income'),
  (8000,'Other Expenses','other_expense');
