-- Founder 299 THB is a first-year, first-time promotion. Migration 048
-- already keeps each confirmed grant in the append-only founder_seat_ledger;
-- use that permanent, non-PII grant record to reject a repeat application
-- before the member can report or pay for it. This is forward-only and does
-- not rewrite any application, subscription, payment, or ledger row.

create or replace function public.has_my_founder_history()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.founder_seat_ledger ledger
    where ledger.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.has_my_founder_history() from public, anon;
grant execute on function public.has_my_founder_history() to authenticated;

create or replace function public.prevent_repeat_founder_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.plan_id = 'founder' and new.status = 'pending' then
    -- Match payment confirmation's global lock before reading the append-only
    -- ledger. A privileged direct insert therefore cannot pass this check on
    -- an old snapshot while the member's first Founder grant is committing.
    perform pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0));

    if exists (
      select 1
      from public.founder_seat_ledger ledger
      where ledger.user_id = new.user_id
    ) then
      raise exception 'Founder first-year offer cannot be claimed twice; renew at 599 THB/year or choose Teacher';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.prevent_repeat_founder_application() from public, anon, authenticated;

drop trigger if exists trg_prevent_repeat_founder_application on public.upgrade_requests;
create trigger trg_prevent_repeat_founder_application
  before insert or update on public.upgrade_requests
  for each row execute function public.prevent_repeat_founder_application();
