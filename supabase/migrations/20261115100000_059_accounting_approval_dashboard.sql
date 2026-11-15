-- 059: Accounting approval workflow, private evidence bucket, owner dashboard
-- (PENDING, NOT APPLIED). Depends on 058. Touches only the `accounting`
-- schema and a new private storage bucket; no existing site object is altered.

-- ---------------------------------------------------------------------------
-- Private evidence bucket: nobody reads via the public API except the owner.
-- Uploads are done server-side with the service role.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('accounting-evidence', 'accounting-evidence', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy accounting_evidence_owner_read on storage.objects
  for select to authenticated
  using (bucket_id = 'accounting-evidence' and (select public.is_owner()));

-- ---------------------------------------------------------------------------
-- Approval. One internal implementation, two guarded entry points.
-- Approving an income/expense posts a balanced journal entry:
--   income : Dr 1000 Cash & Bank / Cr <revenue account on the transaction>
--   expense: Dr <expense account on the transaction> / Cr 1000 Cash & Bank
-- Transfers/adjustments need a manual journal entry and are refused here.
-- ---------------------------------------------------------------------------
create function accounting._decide(p_txn uuid, p_decision text, p_note text, p_by uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t accounting.transactions%rowtype;
  acct accounting.accounts%rowtype;
  cash uuid;
  je uuid;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'decision must be approved or rejected';
  end if;
  select * into t from accounting.transactions where id = p_txn for update;
  if not found then raise exception 'transaction not found'; end if;
  if t.status <> 'pending' then
    raise exception 'transaction % is already %', t.ref, t.status;
  end if;

  if p_decision = 'approved' then
    if t.type not in ('income','expense') then
      raise exception 'transaction type % needs a manual journal entry', t.type;
    end if;
    if t.account_id is null then
      raise exception 'transaction % has no account; classify it before approval', t.ref;
    end if;
    select * into acct from accounting.accounts where id = t.account_id;
    if (t.type = 'income' and acct.type not in ('revenue','other_income'))
       or (t.type = 'expense' and acct.type not in ('expense','cogs','other_expense')) then
      raise exception 'account % (%) does not match transaction type %', acct.code, acct.type, t.type;
    end if;
    select id into cash from accounting.accounts where code = 1000;

    insert into accounting.journal_entries (transaction_id, entry_date, memo, is_simulated)
      values (t.id, (t.occurred_at at time zone 'Asia/Bangkok')::date, t.description, t.is_simulated)
      returning id into je;
    if t.type = 'income' then
      insert into accounting.journal_lines (entry_id, account_id, debit, credit) values
        (je, cash, t.amount, 0), (je, t.account_id, 0, t.amount);
    else
      insert into accounting.journal_lines (entry_id, account_id, debit, credit) values
        (je, t.account_id, t.amount, 0), (je, cash, 0, t.amount);
    end if;
    update accounting.journal_entries set status = 'approved' where id = je;
    update accounting.transactions
      set status = 'approved', approved_by = p_by, approved_at = now() where id = t.id;
  else
    update accounting.transactions set status = 'rejected' where id = t.id;
  end if;

  insert into accounting.approvals (transaction_id, decision, decided_by, note)
    values (t.id, p_decision, p_by, p_note);
  return t.id;
end $$;
revoke all on function accounting._decide(uuid, text, text, uuid) from public, anon, authenticated;

-- Owner signed in on the web.
create function accounting.approve_transaction(p_txn uuid, p_decision text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_owner()) then raise exception 'owner only'; end if;
  return accounting._decide(p_txn, p_decision, p_note, (select auth.uid()));
end $$;
revoke all on function accounting.approve_transaction(uuid, text, text) from public, anon;
grant execute on function accounting.approve_transaction(uuid, text, text) to authenticated;

-- LINE flow: the server has already verified the LINE user is the owner and
-- passes the owner's profile id. Callable by the service role only.
create function accounting.approve_transaction_service(
  p_owner uuid, p_txn uuid, p_decision text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_owner and role = 'owner') then
    raise exception 'not an owner profile';
  end if;
  return accounting._decide(p_txn, p_decision, p_note, p_owner);
end $$;
revoke all on function accounting.approve_transaction_service(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function accounting.approve_transaction_service(uuid, uuid, text, text) to service_role;
grant usage on schema accounting to service_role;

-- Void (never delete): reverses the journal entry with a new mirrored entry.
create function accounting.void_transaction(p_txn uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t accounting.transactions%rowtype; je accounting.journal_entries%rowtype; nje uuid;
begin
  if not (select public.is_owner()) then raise exception 'owner only'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required'; end if;
  select * into t from accounting.transactions where id = p_txn for update;
  if not found or t.status <> 'approved' then raise exception 'only approved transactions can be voided'; end if;
  select * into je from accounting.journal_entries where transaction_id = t.id and status = 'approved' limit 1;
  insert into accounting.journal_entries (transaction_id, entry_date, memo, reverses_id, is_simulated)
    values (t.id, current_date, 'VOID: ' || p_reason, je.id, t.is_simulated) returning id into nje;
  insert into accounting.journal_lines (entry_id, account_id, debit, credit)
    select nje, account_id, credit, debit from accounting.journal_lines where entry_id = je.id;
  update accounting.journal_entries set status = 'approved' where id = nje;
  update accounting.journal_entries set status = 'voided' where id = je.id;
  update accounting.transactions set status = 'voided' where id = t.id;
  insert into accounting.approvals (transaction_id, decision, decided_by, note)
    values (t.id, 'rejected', (select auth.uid()), 'VOID: ' || p_reason);
  return nje;
end $$;
revoke all on function accounting.void_transaction(uuid, text) from public, anon;
grant execute on function accounting.void_transaction(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard: REAL numbers only (approved, non-simulated journal entries).
-- Pending counts are reported separately and never added to any total.
-- Owner or service role; period is [p_from, p_to] inclusive by entry_date.
-- ---------------------------------------------------------------------------
create function accounting.dashboard_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if coalesce((select auth.role()), 'service_role') <> 'service_role'
     and not (select public.is_owner()) then
    raise exception 'owner only';
  end if;
  with lines as (
    select a.code, a.type, jl.debit, jl.credit
    from accounting.journal_lines jl
    join accounting.journal_entries je on je.id = jl.entry_id
    join accounting.accounts a on a.id = jl.account_id
    where je.status in ('approved','voided')   -- voided originals net out via their reversal
      and not je.is_simulated
      and je.entry_date between p_from and p_to
  ), sums as (
    select
      coalesce(sum(credit - debit) filter (where type = 'revenue'), 0) as revenue,
      coalesce(sum(debit - credit) filter (where type = 'cogs'), 0) as cogs,
      coalesce(sum(debit - credit) filter (where type = 'expense'), 0) as expenses,
      coalesce(sum(credit - debit) filter (where type = 'other_income'), 0) as other_income,
      coalesce(sum(debit - credit) filter (where type = 'other_expense'), 0) as other_expense,
      coalesce(sum(debit - credit) filter (where code = 1000), 0) as cash_movement,
      coalesce(sum(debit - credit) filter (where code = 1100), 0) as receivable,
      coalesce(sum(credit - debit) filter (where code = 2000), 0) as payable
    from lines
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'basis', 'approved non-simulated journal entries only',
    'total_revenue', revenue,
    'total_expenses', cogs + expenses + other_expense,
    'gross_profit', revenue - cogs,
    'net_profit', revenue - cogs - expenses + other_income - other_expense,
    'cash_movement_in_period', cash_movement,
    'accounts_receivable', receivable,
    'accounts_payable', payable,
    'sales_by_channel', (
      select coalesce(jsonb_object_agg(code::text, v), '{}'::jsonb) from (
        select a.code, sum(jl.credit - jl.debit) v
        from accounting.journal_lines jl
        join accounting.journal_entries je on je.id = jl.entry_id
        join accounting.accounts a on a.id = jl.account_id
        where a.type = 'revenue' and je.status in ('approved','voided')
          and not je.is_simulated and je.entry_date between p_from and p_to
        group by a.code) c),
    'pending_transactions', (
      select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0))
      from accounting.transactions where status = 'pending' and not is_simulated),
    'simulated_rows_excluded', (
      select count(*) from accounting.transactions where is_simulated)
  ) into r from sums;
  return r;
end $$;
revoke all on function accounting.dashboard_summary(date, date) from public, anon;
grant execute on function accounting.dashboard_summary(date, date) to authenticated, service_role;
