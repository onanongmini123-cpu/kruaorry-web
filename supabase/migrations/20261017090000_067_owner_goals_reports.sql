-- 067: owner-only monthly goals and aggregate finance reports. Additive to 065/066.
-- Member income comes ONLY from membership_payment_confirmations, never upgrade_requests.
set local lock_timeout = '5s';

create table public.owner_monthly_goals (
  month_start date primary key check (month_start >= date '2024-01-01' and extract(day from month_start) = 1),
  income_target_satang bigint not null check (income_target_satang > 0 and income_target_satang <= 100000000000),
  pro_target_count integer check (pro_target_count is null or pro_target_count >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.owner_monthly_goal_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  month_start date not null,
  action text not null check (action in ('create', 'update')),
  old_summary jsonb,
  new_summary jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.owner_goal_audit_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Goal audit is append-only' using errcode = '42501';
end;
$$;
create trigger owner_goal_audit_append_only before update or delete on public.owner_monthly_goal_audit
  for each row execute function public.owner_goal_audit_append_only();

alter table public.owner_monthly_goals enable row level security;
alter table public.owner_monthly_goal_audit enable row level security;
revoke all on table public.owner_monthly_goals, public.owner_monthly_goal_audit from public, anon, authenticated;
grant select on table public.owner_monthly_goals, public.owner_monthly_goal_audit to authenticated;
create policy owner_monthly_goals_read on public.owner_monthly_goals
  for select to authenticated using ((select public.is_owner()));
create policy owner_monthly_goal_audit_read on public.owner_monthly_goal_audit
  for select to authenticated using ((select public.is_owner()));

create or replace function public.owner_save_monthly_goal(
  p_month_start date, p_income_target_satang bigint, p_pro_target_count integer default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_old public.owner_monthly_goals;
  v_action text;
begin
  if not coalesce(public.is_owner(), false) then
    raise exception 'Only the site owner can save goals' using errcode = '42501';
  end if;
  if p_month_start is null or p_month_start < date '2024-01-01'
     or extract(day from p_month_start) <> 1
     or p_income_target_satang is null or p_income_target_satang <= 0
     or p_income_target_satang > 100000000000
     or (p_pro_target_count is not null and p_pro_target_count < 0) then
    raise exception 'Invalid monthly goal' using errcode = '22023';
  end if;
  select * into v_old from public.owner_monthly_goals where month_start = p_month_start for update;
  if found and v_old.income_target_satang = p_income_target_satang
     and v_old.pro_target_count is not distinct from p_pro_target_count then
    return false;
  end if;
  v_action := case when found then 'update' else 'create' end;
  insert into public.owner_monthly_goals (
    month_start, income_target_satang, pro_target_count, created_by
  ) values (p_month_start, p_income_target_satang, p_pro_target_count, (select auth.uid()))
  on conflict (month_start) do update set
    income_target_satang = excluded.income_target_satang,
    pro_target_count = excluded.pro_target_count,
    updated_at = pg_catalog.now();
  insert into public.owner_monthly_goal_audit (
    actor_id, month_start, action, old_summary, new_summary
  ) values (
    (select auth.uid()), p_month_start, v_action,
    case when v_action = 'create' then null else pg_catalog.jsonb_build_object(
      'income_target_satang', v_old.income_target_satang, 'pro_target_count', v_old.pro_target_count
    ) end,
    pg_catalog.jsonb_build_object(
      'income_target_satang', p_income_target_satang, 'pro_target_count', p_pro_target_count
    )
  );
  return true;
end;
$$;

-- Internal helper. The public RPC below checks owner first; callers cannot execute this directly.
create or replace function public.owner_finance_day_totals(p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'member_income_satang', coalesce((
      select sum(c.amount_thb::bigint * 100)
      from public.membership_payment_confirmations c
      where c.confirmed_at >= (p_day::timestamp at time zone 'Asia/Bangkok')
        and c.confirmed_at < ((p_day + 1)::timestamp at time zone 'Asia/Bangkok')
    ), 0::bigint),
    'manual_income_satang', coalesce((
      select sum(e.amount_satang) from public.owner_manual_finance_entries e
      where e.kind = 'income' and e.voided_at is null and e.occurred_on = p_day
    ), 0::bigint),
    'refund_satang', coalesce((
      select sum(e.amount_satang) from public.owner_manual_finance_entries e
      where e.kind = 'refund' and e.voided_at is null and e.occurred_on = p_day
    ), 0::bigint),
    'expense_satang', coalesce((
      select sum(e.amount_satang) from public.owner_manual_finance_entries e
      where e.kind = 'expense' and e.voided_at is null and e.occurred_on = p_day
    ), 0::bigint)
  );
$$;

create or replace function public.owner_finance_report(p_as_of date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date;
  v_month date;
  v_month_day_count integer;
  v_goal public.owner_monthly_goals;
  v_daily_target bigint;
  v_day jsonb;
  v_today_net bigint;
  v_member bigint;
  v_manual bigint;
  v_refund bigint;
  v_expense bigint;
  v_net bigint;
  v_profit bigint;
  v_months jsonb := '[]'::jsonb;
  v_month_item jsonb;
  v_previous_net bigint := 0;
  v_current_item jsonb;
  v_best jsonb;
  v_streak integer := 0;
  v_check_day date;
  v_check_target bigint;
  v_check_goal bigint;
  v_check_net bigint;
  v_pro_count integer;
  v_new_members integer;
  v_unmatched integer;
  v_index integer;
  v_iter_month date;
begin
  if not coalesce(public.is_owner(), false) then
    raise exception 'Only the site owner can read finance reports' using errcode = '42501';
  end if;
  v_today := coalesce(p_as_of, public.owner_finance_today());
  if v_today < date '2024-01-01' or v_today > public.owner_finance_today() then
    raise exception 'Report day is outside the supported range' using errcode = '22023';
  end if;
  v_month := pg_catalog.date_trunc('month', v_today)::date;
  v_month_day_count := extract(day from (v_month + interval '1 month - 1 day'))::integer;
  select * into v_goal from public.owner_monthly_goals where month_start = v_month;
  v_daily_target := case when v_goal.month_start is null then null
    else (v_goal.income_target_satang + v_month_day_count - 1) / v_month_day_count end;

  v_day := public.owner_finance_day_totals(v_today);
  v_today_net := (v_day->>'member_income_satang')::bigint
    + (v_day->>'manual_income_satang')::bigint - (v_day->>'refund_satang')::bigint;

  for v_index in 0..12 loop
    v_iter_month := (v_month - ((12 - v_index) || ' months')::interval)::date;
    select coalesce(sum(c.amount_thb::bigint * 100), 0) into v_member
    from public.membership_payment_confirmations c
    where c.confirmed_at >= (v_iter_month::timestamp at time zone 'Asia/Bangkok')
      and c.confirmed_at < ((v_iter_month + interval '1 month') at time zone 'Asia/Bangkok')
      and c.confirmed_at < ((v_today + 1)::timestamp at time zone 'Asia/Bangkok');
    select coalesce(sum(e.amount_satang) filter (where e.kind = 'income'), 0),
           coalesce(sum(e.amount_satang) filter (where e.kind = 'refund'), 0),
           coalesce(sum(e.amount_satang) filter (where e.kind = 'expense'), 0)
      into v_manual, v_refund, v_expense
    from public.owner_manual_finance_entries e
    where e.voided_at is null and e.occurred_on >= v_iter_month
      and e.occurred_on < (v_iter_month + interval '1 month')::date
      and e.occurred_on <= v_today;
    v_net := v_member + v_manual - v_refund;
    v_profit := v_net - v_expense;
    v_month_item := pg_catalog.jsonb_build_object(
      'month', v_iter_month,
      'member_income_satang', v_member,
      'manual_income_satang', v_manual,
      'refund_satang', v_refund,
      'expense_satang', v_expense,
      'net_revenue_satang', v_net,
      'profit_satang', v_profit
    );
    if v_index = 11 then v_previous_net := v_net; end if;
    if v_index > 0 then v_months := v_months || pg_catalog.jsonb_build_array(v_month_item); end if;
    if v_index = 12 then v_current_item := v_month_item; end if;
  end loop;

  with finance_events as (
    select (c.confirmed_at at time zone 'Asia/Bangkok')::date as day,
      c.amount_thb::bigint * 100 as amount
    from public.membership_payment_confirmations c
    where c.confirmed_at < ((v_today + 1)::timestamp at time zone 'Asia/Bangkok')
    union all
    select e.occurred_on, case when e.kind = 'income' then e.amount_satang else -e.amount_satang end
    from public.owner_manual_finance_entries e
    where e.voided_at is null and e.kind in ('income', 'refund') and e.occurred_on <= v_today
  )
  select pg_catalog.jsonb_build_object('date', day, 'net_revenue_satang', sum(amount))
    into v_best from finance_events group by day order by sum(amount) desc, day asc limit 1;

  v_check_day := v_today - 1;
  while v_check_day >= date '2024-01-01' loop
    select g.income_target_satang into v_check_goal from public.owner_monthly_goals g
    where g.month_start = pg_catalog.date_trunc('month', v_check_day)::date;
    exit when v_check_goal is null;
    v_check_target := (v_check_goal + extract(day from (
      pg_catalog.date_trunc('month', v_check_day) + interval '1 month - 1 day'
    ))::integer - 1) / extract(day from (
      pg_catalog.date_trunc('month', v_check_day) + interval '1 month - 1 day'
    ))::integer;
    v_day := public.owner_finance_day_totals(v_check_day);
    v_check_net := (v_day->>'member_income_satang')::bigint
      + (v_day->>'manual_income_satang')::bigint - (v_day->>'refund_satang')::bigint;
    exit when v_check_net < v_check_target;
    v_streak := v_streak + 1;
    v_check_day := v_check_day - 1;
  end loop;

  select count(*)::integer into v_new_members from public.profiles p
  where p.role = 'member'
    and p.created_at >= (v_today::timestamp at time zone 'Asia/Bangkok')
    and p.created_at < ((v_today + 1)::timestamp at time zone 'Asia/Bangkok');
  select count(*)::integer into v_unmatched from public.upgrade_requests r
  where r.status = 'approved' and r.payment_confirmed_at is not null
    and not exists (select 1 from public.membership_payment_confirmations c where c.request_id = r.id);
  v_pro_count := (public.get_admin_overview_insights(
    case when p_as_of is null then pg_catalog.statement_timestamp()
      else ((v_today + 1)::timestamp at time zone 'Asia/Bangkok') - interval '1 microsecond' end
  )->'premium_memberships'->>'active_count')::integer;

  return pg_catalog.jsonb_build_object(
    'timezone', 'Asia/Bangkok', 'as_of', v_today,
    'today', (public.owner_finance_day_totals(v_today) || pg_catalog.jsonb_build_object(
      'net_revenue_satang', v_today_net,
      'goal_satang', v_daily_target,
      'remaining_satang', case when v_daily_target is null then null else greatest(0::bigint, v_daily_target - v_today_net) end,
      'new_members', v_new_members
    )),
    'month', (v_current_item || pg_catalog.jsonb_build_object(
      'goal_satang', v_goal.income_target_satang,
      'pro_target_count', v_goal.pro_target_count,
      'pro_active_count', v_pro_count,
      'previous_net_revenue_satang', v_previous_net,
      'daily_target_satang', v_daily_target,
      'days_elapsed', extract(day from v_today)::integer,
      'days_total', v_month_day_count
    )),
    'months', v_months,
    'best_day', v_best,
    'streak_days', v_streak,
    'unmatched_approved_requests', v_unmatched
  );
end;
$$;

create or replace function public.owner_finance_csv(p_as_of date default null)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_report jsonb;
  v_csv text;
begin
  if not coalesce(public.is_owner(), false) then
    raise exception 'Only the site owner can export finance reports' using errcode = '42501';
  end if;
  v_report := public.owner_finance_report(p_as_of);
  select 'month,member_income_satang,manual_income_satang,refund_satang,expense_satang,net_revenue_satang,profit_satang' || E'\n' ||
    coalesce(pg_catalog.string_agg(
      (m->>'month') || ',' || (m->>'member_income_satang') || ',' ||
      (m->>'manual_income_satang') || ',' || (m->>'refund_satang') || ',' ||
      (m->>'expense_satang') || ',' || (m->>'net_revenue_satang') || ',' ||
      (m->>'profit_satang'), E'\n' order by m->>'month'
    ), '') into v_csv
  from pg_catalog.jsonb_array_elements(v_report->'months') m;
  return v_csv || E'\n';
end;
$$;

revoke all on function public.owner_goal_audit_append_only() from public, anon, authenticated;
revoke all on function public.owner_finance_day_totals(date) from public, anon, authenticated;
revoke all on function public.owner_save_monthly_goal(date,bigint,integer) from public, anon;
revoke all on function public.owner_finance_report(date) from public, anon;
revoke all on function public.owner_finance_csv(date) from public, anon;
grant execute on function public.owner_save_monthly_goal(date,bigint,integer) to authenticated;
grant execute on function public.owner_finance_report(date) to authenticated;
grant execute on function public.owner_finance_csv(date) to authenticated;
