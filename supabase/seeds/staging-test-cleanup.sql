-- STAGING ONLY (project bqgzmlujxtucojforjff). Removes ONLY the rows made by
-- supabase/seeds/staging-test-data.sql: every resource titled "[TEST]..." and
-- everything that hangs off it (plan access, previews, hearts, view rows are
-- deleted by ON DELETE CASCADE), plus the "[TEST]" homepage video.
-- Test accounts (stg1/2/3) are not touched here; see staging-test-accounts.sql.
do $guard$
begin
  if not exists (select 1 from public.profiles where email = 'admin-70efa2be-e742-4321-a2b9-e3a1f629a3ed@example.com') then
    raise exception 'This is not the staging database. Aborting.';
  end if;
end
$guard$;
delete from public.homepage_videos where title like '[TEST]%';
delete from public.resources where title like '[TEST]%';
