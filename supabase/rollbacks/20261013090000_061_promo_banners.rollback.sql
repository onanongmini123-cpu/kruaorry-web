-- Rollback for 20261013090000_061_promo_banners.sql
--
-- Drops the admin function and the banner table in one transaction. Nothing else
-- depends on them. Stored banner rows are discarded (the picture files in
-- Storage are not touched). Re-applying 061 afterwards works.
begin;
set local lock_timeout = '5s';

drop function if exists public.admin_set_promo_banners(jsonb);
drop table if exists public.promo_banners;

commit;
