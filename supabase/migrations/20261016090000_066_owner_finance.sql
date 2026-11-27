-- 066: the owner's own finance records for "บัญชีและเป้าหมาย". ADDITIVE ONLY.
--
-- WHAT THIS ADDS (nothing existing is changed; 065 is not required)
--   public.owner_manual_finance_entries
--     Money the owner records by hand: kind income / expense / refund, amount in satang
--     (bigint, > 0), the Thai day it happened, a category and an optional channel (both
--     free text; the screen suggests values such as LINE, Shopee, โอนตรง, อบรม), an
--     optional note, reference and receipt. Rows are never edited or deleted: a mistake
--     is VOIDED (with a reason, audited) and a new row is recorded. The only later change
--     allowed is attaching a receipt to a row that has none. A trigger enforces this.
--     Confirmed membership payments are NOT stored here: they already live in
--     membership_payment_confirmations (048) and are counted from there by 067. Income
--     whose reference matches a confirmed membership payment or application is refused,
--     so the same money cannot be counted twice.
--   public.owner_recurring_expenses
--     Reminders only (Vercel, Supabase, domain ...). Nothing becomes a real expense until
--     the owner presses "จ่ายแล้ว" (owner_mark_recurring_expense_paid), which records one
--     expense row for that month; the same month cannot be paid twice.
--   public.owner_finance_audit
--     Append-only history of every change (create / void / attach receipt / recurring
--     create, update, paid). Stores summaries only, never a receipt link or signed URL.
--   storage bucket owner-expense-receipts
--     Private, 5 MB, JPEG / PNG / WebP / PDF. Paths: entries/<entry id>/<random id>.<ext>.
--     Only the owner can upload or read. A receipt that belongs to an entry (voided or
--     not) cannot be deleted; an unused upload can.
--   Functions (SECURITY DEFINER, search_path '', public.is_owner() checked FIRST, 42501
--   otherwise; authenticated may call, anon may not):
--     owner_add_finance_entry, owner_void_finance_entry, owner_attach_finance_receipt,
--     owner_save_recurring_expense, owner_mark_recurring_expense_paid,
--     owner_recurring_expenses_due
--   Reading: the owner reads the three tables directly (RLS: owner only, SELECT only).
--   Admins who are not the owner, members and anon see nothing.
--
-- pg_safeupdate: every UPDATE here has a WHERE clause; there are no DELETEs.
--
-- ROLLBACK
--   supabase/rollbacks/20261016090000_066_owner_finance.rollback.sql (drops the tables,
--   functions and storage policies; recorded money is lost; the empty or used bucket is
--   left in place because Supabase does not allow deleting storage rows from SQL).
--
-- APPLY (not applied by this repository; run by the project owner)
--   staging first; then supabase/verification/066-verify.sql (every row ok = true).

set local lock_timeout = '5s';

-- ------------------------------------------------------------------ tables

create table if not exists public.owner_recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (pg_catalog.btrim(category) <> '' and pg_catalog.char_length(category) <= 60),
  channel text check (channel is null or (pg_catalog.btrim(channel) <> '' and pg_catalog.char_length(channel) <= 60)),
  description text check (description is null or pg_catalog.char_length(description) <= 500),
  amount_satang bigint not null check (amount_satang > 0 and amount_satang <= 10000000000),
  day_of_month smallint not null check (day_of_month between 1 and 31),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_recurring_expenses_dates check (ends_on is null or ends_on >= starts_on)
);

create table if not exists public.owner_manual_finance_entries (
  id uuid primary key,
  kind text not null check (kind in ('income', 'expense', 'refund')),
  amount_satang bigint not null check (amount_satang > 0 and amount_satang <= 10000000000),
  occurred_on date not null check (occurred_on >= date '2024-01-01'),
  category text not null check (pg_catalog.btrim(category) <> '' and pg_catalog.char_length(category) <= 60),
  channel text check (channel is null or (pg_catalog.btrim(channel) <> '' and pg_catalog.char_length(channel) <= 60)),
  description text check (description is null or pg_catalog.char_length(description) <= 500),
  source_reference text check (source_reference is null or (pg_catalog.btrim(source_reference) <> '' and pg_catalog.char_length(source_reference) <= 120)),
  receipt_path text check (receipt_path is null or receipt_path ~ '^entries/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp|pdf)$'),
  recurring_expense_id uuid references public.owner_recurring_expenses(id) on delete restrict,
  recurring_due_month date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  constraint owner_finance_entries_receipt_under_entry check (receipt_path is null or pg_catalog.split_part(receipt_path, '/', 2) = id::text),
  constraint owner_finance_entries_recurring check (
    (recurring_expense_id is null and recurring_due_month is null)
    or (kind = 'expense' and recurring_expense_id is not null and recurring_due_month is not null
        and extract(day from recurring_due_month) = 1)
  ),
  constraint owner_finance_entries_void check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and void_reason is not null and pg_catalog.btrim(void_reason) <> '' and pg_catalog.char_length(void_reason) <= 300)
  )
);

-- One live entry per reference and kind (a refund may quote the income it returns).
create unique index if not exists owner_finance_entries_reference_once
  on public.owner_manual_finance_entries (kind, pg_catalog.lower(pg_catalog.btrim(source_reference)))
  where voided_at is null and source_reference is not null;
-- A recurring expense is paid at most once per month (a voided payment can be redone).
create unique index if not exists owner_finance_entries_recurring_once
  on public.owner_manual_finance_entries (recurring_expense_id, recurring_due_month)
  where voided_at is null and recurring_expense_id is not null;
create index if not exists owner_finance_entries_occurred
  on public.owner_manual_finance_entries (occurred_on);

create table if not exists public.owner_finance_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('entry_create', 'entry_void', 'entry_receipt', 'recurring_create', 'recurring_update', 'recurring_paid')),
  entity_type text not null check (entity_type in ('entry', 'recurring')),
  entity_id uuid not null,
  old_summary jsonb,
  new_summary jsonb,
  created_at timestamptz not null default now()
);
create index if not exists owner_finance_audit_entity on public.owner_finance_audit (entity_id, created_at);

comment on table public.owner_manual_finance_entries is
  'Owner-entered income / expense / refund (066). Never edited or deleted: void + new row. Membership payments are counted from membership_payment_confirmations, not here.';
comment on table public.owner_recurring_expenses is
  'Recurring expense reminders (066). Not real expenses until marked paid.';
comment on table public.owner_finance_audit is
  'Append-only history of owner finance changes (066). Summaries only, no receipt links.';

-- ------------------------------------------------------------------ guards

-- Entries: no DELETE; UPDATE may only void a live row or attach a first receipt.
create or replace function public.owner_finance_entries_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Finance entries are never deleted; void them instead' using errcode = '42501';
  end if;
  if (new.id, new.kind, new.amount_satang, new.occurred_on, new.category, new.channel, new.description,
      new.source_reference, new.recurring_expense_id, new.recurring_due_month, new.created_by, new.created_at)
     is distinct from
     (old.id, old.kind, old.amount_satang, old.occurred_on, old.category, old.channel, old.description,
      old.source_reference, old.recurring_expense_id, old.recurring_due_month, old.created_by, old.created_at) then
    raise exception 'Finance entries cannot be edited; void and record a new one' using errcode = '42501';
  end if;
  if old.voided_at is not null and (new.voided_at, new.voided_by, new.void_reason, new.receipt_path)
     is distinct from (old.voided_at, old.voided_by, old.void_reason, old.receipt_path) then
    raise exception 'A voided entry cannot change' using errcode = '42501';
  end if;
  if new.voided_at is null and (new.voided_by, new.void_reason) is distinct from (old.voided_by, old.void_reason) then
    raise exception 'A void cannot be undone' using errcode = '42501';
  end if;
  if old.receipt_path is not null and new.receipt_path is distinct from old.receipt_path then
    raise exception 'A receipt cannot be replaced' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists owner_finance_entries_guard on public.owner_manual_finance_entries;
create trigger owner_finance_entries_guard
  before update or delete on public.owner_manual_finance_entries
  for each row execute function public.owner_finance_entries_guard();

create or replace function public.owner_finance_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'owner_finance_audit is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists owner_finance_audit_append_only on public.owner_finance_audit;
create trigger owner_finance_audit_append_only
  before update or delete on public.owner_finance_audit
  for each row execute function public.owner_finance_audit_append_only();

-- ------------------------------------------------------------------ privileges and RLS

alter table public.owner_manual_finance_entries enable row level security;
alter table public.owner_recurring_expenses enable row level security;
alter table public.owner_finance_audit enable row level security;

revoke all on table public.owner_manual_finance_entries, public.owner_recurring_expenses, public.owner_finance_audit
  from public, anon, authenticated;
-- The owner reads; every write goes through the functions below (which also audit).
grant select on table public.owner_manual_finance_entries, public.owner_recurring_expenses, public.owner_finance_audit
  to authenticated;

drop policy if exists "owner_finance_entries_owner_read" on public.owner_manual_finance_entries;
create policy "owner_finance_entries_owner_read" on public.owner_manual_finance_entries
  for select to authenticated using ((select public.is_owner()));
drop policy if exists "owner_recurring_expenses_owner_read" on public.owner_recurring_expenses;
create policy "owner_recurring_expenses_owner_read" on public.owner_recurring_expenses
  for select to authenticated using ((select public.is_owner()));
drop policy if exists "owner_finance_audit_owner_read" on public.owner_finance_audit;
create policy "owner_finance_audit_owner_read" on public.owner_finance_audit
  for select to authenticated using ((select public.is_owner()));

-- ------------------------------------------------------------------ helpers (internal)

create or replace function public.owner_finance_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (pg_catalog.now() at time zone 'Asia/Bangkok')::date;
$$;

create or replace function public.owner_finance_entry_summary(p_entry public.owner_manual_finance_entries)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'kind', p_entry.kind,
    'amount_satang', p_entry.amount_satang,
    'occurred_on', p_entry.occurred_on,
    'category', p_entry.category,
    'channel', p_entry.channel,
    'description', p_entry.description,
    'source_reference', p_entry.source_reference,
    'has_receipt', p_entry.receipt_path is not null,
    'recurring_expense_id', p_entry.recurring_expense_id,
    'recurring_due_month', p_entry.recurring_due_month,
    'voided', p_entry.voided_at is not null,
    'void_reason', p_entry.void_reason
  );
$$;

create or replace function public.owner_recurring_summary(p_item public.owner_recurring_expenses)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'category', p_item.category,
    'channel', p_item.channel,
    'description', p_item.description,
    'amount_satang', p_item.amount_satang,
    'day_of_month', p_item.day_of_month,
    'starts_on', p_item.starts_on,
    'ends_on', p_item.ends_on,
    'active', p_item.active
  );
$$;

-- Due day of a recurring expense in a month (day 31 falls on the last day of shorter months).
create or replace function public.owner_recurring_due_on(p_month date, p_day smallint)
returns date
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.date_trunc('month', p_month)::date
    + (least(p_day::integer,
             extract(day from (pg_catalog.date_trunc('month', p_month) + interval '1 month - 1 day'))::integer) - 1);
$$;

create or replace function public.owner_finance_clean(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(pg_catalog.btrim(p_text), '');
$$;

-- Checks a receipt path for an entry and that the file was really uploaded.
create or replace function public.owner_finance_check_receipt(p_entry_id uuid, p_path text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_path !~ '^entries/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp|pdf)$'
     or pg_catalog.split_part(p_path, '/', 2) <> p_entry_id::text then
    raise exception 'Receipt must be stored under entries/<entry id>/' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'owner-expense-receipts' and o.name = p_path) then
    raise exception 'Receipt file not found' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.owner_finance_check_text(p_category text, p_channel text, p_description text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_category is null or pg_catalog.char_length(p_category) > 60 then
    raise exception 'Category is required (at most 60 characters)' using errcode = '22023';
  end if;
  if p_channel is not null and pg_catalog.char_length(p_channel) > 60 then
    raise exception 'Channel must be at most 60 characters' using errcode = '22023';
  end if;
  if p_description is not null and pg_catalog.char_length(p_description) > 500 then
    raise exception 'Note must be at most 500 characters' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.owner_finance_check_amount(p_amount_satang bigint)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_amount_satang is null or p_amount_satang <= 0 or p_amount_satang > 10000000000 then
    raise exception 'Amount must be more than 0 and at most 100,000,000 baht' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.owner_finance_check_day(p_day date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_day is null or p_day < date '2024-01-01' or p_day > public.owner_finance_today() then
    raise exception 'Date must be between 2024-01-01 and today (Thai time)' using errcode = '22023';
  end if;
end;
$$;

-- ------------------------------------------------------------------ entries

create or replace function public.owner_add_finance_entry(
  p_entry_id uuid,
  p_kind text,
  p_amount_satang bigint,
  p_occurred_on date,
  p_category text,
  p_channel text default null,
  p_description text default null,
  p_source_reference text default null,
  p_receipt_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text := public.owner_finance_clean(p_category);
  v_channel text := public.owner_finance_clean(p_channel);
  v_description text := public.owner_finance_clean(p_description);
  v_reference text := public.owner_finance_clean(p_source_reference);
  v_receipt text := public.owner_finance_clean(p_receipt_path);
  v_row public.owner_manual_finance_entries;
begin
  if not coalesce(public.is_owner(), false) then
    raise exception 'Only the site owner can record money' using errcode = '42501';
  end if;
  if p_entry_id is null then
    raise exception 'Entry id is required' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('income', 'expense', 'refund') then
    raise exception 'Kind must be income, expense or refund' using errcode = '22023';
  end if;
  perform public.owner_finance_check_amount(p_amount_satang);
  perform public.owner_finance_check_day(p_occurred_on);
  perform public.owner_finance_check_text(v_category, v_channel, v_description);
  if v_reference is not null and pg_catalog.char_length(v_reference) > 120 then
    raise exception 'Reference must be at most 120 characters' using errcode = '22023';
  end if;
  if v_receipt is not null then
    perform public.owner_finance_check_receipt(p_entry_id, v_receipt);
  end if;

  -- Confirmed membership payments are already counted automatically (048).
  if p_kind = 'income' and v_reference is not null and (
    exists (
      select 1 from public.membership_payment_confirmations c
      where pg_catalog.lower(pg_catalog.btrim(c.payment_reference)) = pg_catalog.lower(v_reference)
         or pg_catalog.lower(pg_catalog.btrim(c.application_reference_code)) = pg_catalog.lower(v_reference)
    )
    or exists (
      select 1 from public.upgrade_requests r
      where r.status = 'approved'
        and (pg_catalog.lower(pg_catalog.btrim(r.payment_reference)) = pg_catalog.lower(v_reference)
          or pg_catalog.lower(pg_catalog.btrim(r.reference_code)) = pg_catalog.lower(v_reference))
    )
  ) then
    raise exception 'This reference is a confirmed membership payment, which is already counted automatically'
      using errcode = '23505';
  end if;

  if exists (select 1 from public.owner_manual_finance_entries e where e.id = p_entry_id) then
    raise exception 'Entry already exists' using errcode = '23505';
  end if;
  if v_reference is not null and exists (
    select 1 from public.owner_manual_finance_entries e
    where e.kind = p_kind and e.voided_at is null
      and pg_catalog.lower(pg_catalog.btrim(e.source_reference)) = pg_catalog.lower(v_reference)
  ) then
    raise exception 'An entry with this reference is already recorded' using errcode = '23505';
  end if;

  insert into public.owner_manual_finance_entries (
    id, kind, amount_satang, occurred_on, category, channel, description, source_reference, receipt_path, created_by
  ) values (
    p_entry_id, p_kind, p_amount_satang, p_occurred_on, v_category, v_channel, v_description, v_reference, v_receipt,
    (select auth.uid())
  )
  returning * into v_row;

  insert into public.owner_finance_audit (actor_id, action, entity_type, entity_id, old_summary, new_summary)
  values ((select auth.uid()), 'entry_create', 'entry', v_row.id, null, public.owner_finance_entry_summary(v_row));

  return v_row.id;
end;
$$;

create or replace function public.owner_void_finance_entry(p_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.owner_finance_clean(p_reason);
  v_old public.owner_manual_finance_entries;
  v_new public.owner_manual_finance_entries;
begin
  if not coalesce(public.is_owner(), false) then
    raise exception 'Only the site owner can void money entries' using errcode = '42501';
  end if;
  if v_reason is null or pg_catalog.char_length(v_reason) > 300 then
    raise exception 'A reason is required (at most 300 characters)' using errcode = '22023';
  end if;
  select * into v_old from public.owner_manual_finance_entries e where e.id = p_entry_id for update;
  if not found then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;
  if v_old.voided_at is not null then
    raise exception 'Entry is already voided' using errcode = '22023';
  end if;

  update public.owner_manual_finance_entries
  set voided_at = pg_catalog.now(), voided_by = (select auth.uid()), void_reason = v_reason
  where id = p_entry_id
  returning * into v_new;

  insert into public.owner_finance_audit (actor_id, action, entity_type, entity_id, old_summary, new_summary)
  values ((select auth.uid()), 'entry_void', 'entry', p_entry_id,
          public.owner_finance_entry_summary(v_old), public.owner_finance_entry_summary(v_new));
end;
$$;

create or replace function public.owner_attach_finance_receipt(p_entry_id uuid, p_receipt_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := public.owner_finance_clean(p_receipt_path);
  v_old public.owner_manual_finance_entries;
  v_new public.owner_manual_finance_entries;
begin
  if not coalesce(public.is_owner(), false) then
    raise exception 'Only the site owner can attach receipts' using errcode = '42501';
  end if;
  select * into v_old from public.owner_manual_finance_entries e where e.id = p_entry_id for update;
  if not found then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;
  if v_old.voided_at is not null then
    raise exception 'A voided entry cannot change' using errcode = '22023';
  end if;
  if v_old.receipt_path is not null then
    raise exception 'This entry already has a receipt' using errcode = '22023';
  end if;
  if v_path is null then
    raise exception 'Receipt path is required' using errcode = '22023';
  end if;
  perform public.owner_finance_check_receipt(p_entry_id, v_path);

  update public.owner_manual_finance_entries set receipt_path = v_path
  where id = p_entry_id
  returning * into v_new;

  insert into public.owner_finance_audit (actor_id, action, entity_type, entity_id, old_summary, new_summary)
  values ((select auth.uid()), 'entry_receipt', 'entry', p_entry_id,
          public.owner_finance_entry_summary(v_old), public.owner_finance_entry_summary(v_new));
end;
$$;

-- ------------------------------------------------------------------ recurring expenses

create or replace function public.owner_save_recurring_expense(
  p_id uuid,
  p_create boolean,
  p_category text,
  p_amount_satang bigint,
  p_day_of_month integer,
  p_starts_on date,
  p_ends_on date default null,
  p_channel text default null,
  p_description text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text := public.owner_finance_clean(p_category);
  v_channel text := public.owner_finance_clean(p_channel);
  v_description text := public.owner_finance_clean(p_description);
  v_old public.owner_recurring_expenses;
  v_new public.owner_recurring_expenses;
begin
  if not coalesce(public.is_owner(), false) then
    raise exception 'Only the site owner can manage recurring expenses' using errcode = '42501';
  end if;
  if p_id is null or p_create is null then
    raise exception 'Id and create flag are required' using errcode = '22023';
  end if;
  perform public.owner_finance_check_amount(p_amount_satang);
  perform public.owner_finance_check_text(v_category, v_channel, v_description);
  if p_day_of_month is null or p_day_of_month not between 1 and 31 then
    raise exception 'Day of month must be 1 to 31' using errcode = '22023';
  end if;
  if p_starts_on is null or p_starts_on < date '2024-01-01' then
    raise exception 'Start date must be 2024-01-01 or later' using errcode = '22023';
  end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'End date must not be before the start date' using errcode = '22023';
  end if;

  if p_create then
    if exists (select 1 from public.owner_recurring_expenses r where r.id = p_id) then
      raise exception 'Recurring expense already exists' using errcode = '23505';
    end if;
    insert into public.owner_recurring_expenses (
      id, category, channel, description, amount_satang, day_of_month, starts_on, ends_on, active, created_by
    ) values (
      p_id, v_category, v_channel, v_description, p_amount_satang, p_day_of_month, p_starts_on, p_ends_on,
      coalesce(p_active, true), (select auth.uid())
    )
    returning * into v_new;
    insert into public.owner_finance_audit (actor_id, action, entity_type, entity_id, old_summary, new_summary)
    values ((select auth.uid()), 'recurring_create', 'recurring', p_id, null, public.owner_recurring_summary(v_new));
  else
    select * into v_old from public.owner_recurring_expenses r where r.id = p_id for update;
    if not found then
      raise exception 'Recurring expense not found' using errcode = 'P0002';
    end if;
    -- Months already paid keep their recorded expense; this changes future reminders only.
    update public.owner_recurring_expenses
    set category = v_category, channel = v_channel, description = v_description,
        amount_satang = p_amount_satang, day_of_month = p_day_of_month,
        starts_on = p_starts_on, ends_on = p_ends_on, active = coalesce(p_active, true),
        updated_at = pg_catalog.now()
    where id = p_id
    returning * into v_new;
    insert into public.owner_finance_audit (actor_id, action, entity_type, entity_id, old_summary, new_summary)
    values ((select auth.uid()), 'recurring_update', 'recurring', p_id,
            public.owner_recurring_summary(v_old), public.owner_recurring_summary(v_new));
  end if;

  return p_id;
end;
$$;

-- "จ่ายแล้ว": records ONE real expense for that month from the reminder.
create or replace function public.owner_mark_recurring_expense_paid(
  p_recurring_id uuid,
  p_due_month date,
  p_entry_id uuid,
  p_amount_satang bigint default null,
  p_occurred_on date default null,
  p_receipt_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.owner_recurring_expenses;
  v_month date;
  v_due date;
  v_amount bigint;
  v_day date;
  v_receipt text := public.owner_finance_clean(p_receipt_path);
  v_row public.owner_manual_finance_entries;
begin
  if not coalesce(public.is_owner(), false) then
    raise exception 'Only the site owner can record money' using errcode = '42501';
  end if;
  if p_entry_id is null or p_due_month is null then
    raise exception 'Entry id and month are required' using errcode = '22023';
  end if;
  select * into v_item from public.owner_recurring_expenses r where r.id = p_recurring_id for update;
  if not found then
    raise exception 'Recurring expense not found' using errcode = 'P0002';
  end if;

  v_month := pg_catalog.date_trunc('month', p_due_month)::date;
  v_due := public.owner_recurring_due_on(v_month, v_item.day_of_month);
  if not v_item.active or v_due < v_item.starts_on or (v_item.ends_on is not null and v_due > v_item.ends_on) then
    raise exception 'This recurring expense is not due in that month' using errcode = '22023';
  end if;
  if v_month > pg_catalog.date_trunc('month', public.owner_finance_today())::date then
    raise exception 'A future month cannot be marked paid' using errcode = '22023';
  end if;

  v_amount := coalesce(p_amount_satang, v_item.amount_satang);
  v_day := coalesce(p_occurred_on, public.owner_finance_today());
  perform public.owner_finance_check_amount(v_amount);
  perform public.owner_finance_check_day(v_day);
  if v_receipt is not null then
    perform public.owner_finance_check_receipt(p_entry_id, v_receipt);
  end if;
  if exists (select 1 from public.owner_manual_finance_entries e where e.id = p_entry_id) then
    raise exception 'Entry already exists' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.owner_manual_finance_entries e
    where e.recurring_expense_id = p_recurring_id and e.recurring_due_month = v_month and e.voided_at is null
  ) then
    raise exception 'This month is already marked paid' using errcode = '23505';
  end if;

  insert into public.owner_manual_finance_entries (
    id, kind, amount_satang, occurred_on, category, channel, description, receipt_path,
    recurring_expense_id, recurring_due_month, created_by
  ) values (
    p_entry_id, 'expense', v_amount, v_day, v_item.category, v_item.channel, v_item.description, v_receipt,
    p_recurring_id, v_month, (select auth.uid())
  )
  returning * into v_row;

  insert into public.owner_finance_audit (actor_id, action, entity_type, entity_id, old_summary, new_summary)
  values ((select auth.uid()), 'recurring_paid', 'entry', v_row.id, null, public.owner_finance_entry_summary(v_row));

  return v_row.id;
end;
$$;

-- Reminders for one month: each active item with its due day and whether it is paid.
create or replace function public.owner_recurring_expenses_due(p_month date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_month date;
  v_items jsonb;
begin
  if not coalesce(public.is_owner(), false) then
    raise exception 'Only the site owner can read recurring expenses' using errcode = '42501';
  end if;
  v_today := public.owner_finance_today();
  v_month := pg_catalog.date_trunc('month', coalesce(p_month, v_today))::date;

  select coalesce(pg_catalog.jsonb_agg(item order by item ->> 'due_on', item ->> 'category'), '[]'::jsonb)
  into v_items
  from (
    select pg_catalog.jsonb_build_object(
      'id', r.id,
      'category', r.category,
      'channel', r.channel,
      'description', r.description,
      'amount_satang', r.amount_satang,
      'due_on', d.due_on,
      'paid', e.id is not null,
      'entry_id', e.id,
      'status', case
        when e.id is not null then 'paid'
        when d.due_on < v_today then 'overdue'
        when d.due_on = v_today then 'due_today'
        else 'upcoming' end
    ) as item
    from public.owner_recurring_expenses r
    cross join lateral (select public.owner_recurring_due_on(v_month, r.day_of_month) as due_on) d
    left join public.owner_manual_finance_entries e
      on e.recurring_expense_id = r.id and e.recurring_due_month = v_month and e.voided_at is null
    where r.active and d.due_on >= r.starts_on and (r.ends_on is null or d.due_on <= r.ends_on)
  ) items;

  return pg_catalog.jsonb_build_object(
    'timezone', 'Asia/Bangkok',
    'month', v_month,
    'today', v_today,
    'items', v_items,
    'due_unpaid_count', (
      select count(*) from pg_catalog.jsonb_array_elements(v_items) x
      where x ->> 'status' in ('overdue', 'due_today')
    )
  );
end;
$$;

-- ------------------------------------------------------------------ function privileges

revoke all on function public.owner_finance_entries_guard() from public, anon, authenticated;
revoke all on function public.owner_finance_audit_append_only() from public, anon, authenticated;
revoke all on function public.owner_finance_today() from public, anon, authenticated;
revoke all on function public.owner_finance_entry_summary(public.owner_manual_finance_entries) from public, anon, authenticated;
revoke all on function public.owner_recurring_summary(public.owner_recurring_expenses) from public, anon, authenticated;
revoke all on function public.owner_recurring_due_on(date, smallint) from public, anon, authenticated;
revoke all on function public.owner_finance_clean(text) from public, anon, authenticated;
revoke all on function public.owner_finance_check_receipt(uuid, text) from public, anon, authenticated;
revoke all on function public.owner_finance_check_text(text, text, text) from public, anon, authenticated;
revoke all on function public.owner_finance_check_amount(bigint) from public, anon, authenticated;
revoke all on function public.owner_finance_check_day(date) from public, anon, authenticated;

revoke all on function public.owner_add_finance_entry(uuid, text, bigint, date, text, text, text, text, text) from public, anon;
revoke all on function public.owner_void_finance_entry(uuid, text) from public, anon;
revoke all on function public.owner_attach_finance_receipt(uuid, text) from public, anon;
revoke all on function public.owner_save_recurring_expense(uuid, boolean, text, bigint, integer, date, date, text, text, boolean) from public, anon;
revoke all on function public.owner_mark_recurring_expense_paid(uuid, date, uuid, bigint, date, text) from public, anon;
revoke all on function public.owner_recurring_expenses_due(date) from public, anon;

grant execute on function public.owner_add_finance_entry(uuid, text, bigint, date, text, text, text, text, text) to authenticated;
grant execute on function public.owner_void_finance_entry(uuid, text) to authenticated;
grant execute on function public.owner_attach_finance_receipt(uuid, text) to authenticated;
grant execute on function public.owner_save_recurring_expense(uuid, boolean, text, bigint, integer, date, date, text, text, boolean) to authenticated;
grant execute on function public.owner_mark_recurring_expense_paid(uuid, date, uuid, bigint, date, text) to authenticated;
grant execute on function public.owner_recurring_expenses_due(date) to authenticated;

-- ------------------------------------------------------------------ receipts bucket (private)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'owner-expense-receipts',
  'owner-expense-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owner_expense_receipts_owner_select" on storage.objects;
create policy "owner_expense_receipts_owner_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'owner-expense-receipts'
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and (select public.is_owner())
  );

drop policy if exists "owner_expense_receipts_owner_insert" on storage.objects;
create policy "owner_expense_receipts_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'owner-expense-receipts'
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and (select public.is_owner())
    and name ~ '^entries/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp|pdf)$'
  );

-- Only an upload that no entry uses (for example after a cancelled form) can be removed.
drop policy if exists "owner_expense_receipts_owner_delete_unused" on storage.objects;
create policy "owner_expense_receipts_owner_delete_unused"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'owner-expense-receipts'
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and (select public.is_owner())
    and not exists (
      select 1 from public.owner_manual_finance_entries e where e.receipt_path = storage.objects.name
    )
  );
-- No UPDATE policy: a stored receipt is never overwritten.

do $$
begin
  if has_function_privilege('anon', 'public.owner_add_finance_entry(uuid, text, bigint, date, text, text, text, text, text)', 'execute') then
    raise exception '066: anon must not execute owner_add_finance_entry';
  end if;
  if has_table_privilege('anon', 'public.owner_manual_finance_entries', 'select') then
    raise exception '066: anon must not read owner_manual_finance_entries';
  end if;
end
$$;
