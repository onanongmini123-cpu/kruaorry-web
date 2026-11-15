-- Rollback for 059. Removes the approval/void/dashboard functions and the
-- evidence bucket policy. The bucket row is removed only if it is empty;
-- delete uploaded evidence deliberately before rolling back.
begin;
set local lock_timeout = '5s';

drop function if exists accounting.dashboard_summary(date, date);
drop function if exists accounting.void_transaction(uuid, text);
drop function if exists accounting.approve_transaction_service(uuid, uuid, text, text);
drop function if exists accounting.approve_transaction(uuid, text, text);
drop function if exists accounting._decide(uuid, text, text, uuid);
drop policy if exists accounting_evidence_owner_read on storage.objects;
delete from storage.buckets b
  where b.id = 'accounting-evidence'
    and not exists (select 1 from storage.objects o where o.bucket_id = b.id);

commit;
