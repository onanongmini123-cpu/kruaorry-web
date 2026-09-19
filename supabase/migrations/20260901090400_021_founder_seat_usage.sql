-- Give admins a count without exposing the append-only seat ledger or the
-- user IDs it still references. A deleted user's anonymous seat still counts.
create function public.get_founder_seat_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select count(*)::integer into v_count from public.founder_seat_ledger;
  return v_count;
end;
$$;

revoke execute on function public.get_founder_seat_count() from public, anon;
grant execute on function public.get_founder_seat_count() to authenticated;
