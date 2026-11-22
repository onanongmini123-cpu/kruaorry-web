-- STAGING ONLY (project bqgzmlujxtucojforjff). NOT RUN YET: needs the three test
-- e-mail addresses. Replace the three placeholders, then run it once in the
-- staging SQL editor AFTER the three accounts have signed up on the Preview.
--   __STG1_EMAIL__  free member (nothing to change: new accounts start as free)
--   __STG2_EMAIL__  Teacher Pro, active for one year
--   __STG3_EMAIL__  admin
-- If a trigger (enforce_membership_plan_change / prevent_self_privilege_escalation)
-- refuses the role change because the SQL editor has no signed-in admin, grant the
-- roles from the admin console on the Preview with the staging owner account instead.
do $guard$
begin
  if not exists (select 1 from public.profiles where email = 'admin-70efa2be-e742-4321-a2b9-e3a1f629a3ed@example.com') then
    raise exception 'This is not the staging database. Aborting.';
  end if;
  if (select count(*) from public.profiles where email in ('__STG1_EMAIL__', '__STG2_EMAIL__', '__STG3_EMAIL__')) <> 3 then
    raise exception 'Expected exactly 3 test profiles. Check the three addresses.';
  end if;
end
$guard$;

-- stg2: Teacher Pro, active for one year.
insert into public.subscriptions (user_id, plan_id, status, source, price_amount_thb, billing_interval, current_period_start, current_period_end)
select id, 'teacher', 'active', 'admin', 599, 'year', now(), now() + interval '1 year'
from public.profiles where email = '__STG2_EMAIL__'
  and not exists (select 1 from public.subscriptions s where s.user_id = profiles.id and s.status in ('active', 'past_due'));

-- stg3: admin.
update public.profiles set role = 'admin' where email = '__STG3_EMAIL__';

-- Undo (staging only):
--   delete from public.subscriptions where user_id = (select id from public.profiles where email = '__STG2_EMAIL__');
--   update public.profiles set role = 'member' where email = '__STG3_EMAIL__';
