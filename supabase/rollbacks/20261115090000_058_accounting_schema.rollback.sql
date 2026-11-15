-- Rollback for 058. Drops the entire `accounting` schema, INCLUDING ALL DATA.
-- Export/back up accounting.* first if any real records exist.
begin;
set local lock_timeout = '5s';

drop schema if exists accounting cascade;

commit;
