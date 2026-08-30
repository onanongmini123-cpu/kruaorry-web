-- The bootstrap UPDATE in 016 ran while the old (pre-016) version of
-- trg_prevent_self_privilege_escalation was still attached, and auth.uid()
-- is null in a migration's SQL context (no request/session), so is_admin()
-- evaluated false and the trigger silently pinned role back to 'admin'.
-- Disable the trigger for this one administrative update instead.
alter table public.profiles disable trigger trg_prevent_self_privilege_escalation;
update public.profiles set role = 'owner' where role = 'admin';
alter table public.profiles enable trigger trg_prevent_self_privilege_escalation;
