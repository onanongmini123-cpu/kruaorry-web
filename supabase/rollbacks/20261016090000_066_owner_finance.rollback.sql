-- Rollback for 20261016090000_066_owner_finance.sql
--
-- Drops the owner finance tables, their functions and the receipt storage policies.
-- RECORDED MONEY AND ITS HISTORY ARE LOST: export the owner's entries first if needed.
-- The private bucket "owner-expense-receipts" and any uploaded receipts are LEFT IN
-- PLACE (Supabase does not allow deleting storage rows from SQL). With the policies
-- gone nobody but the service role can reach them; empty or delete the bucket from the
-- Supabase dashboard if it is no longer wanted. Re-applying 066 afterwards works.
begin;
set local lock_timeout = '5s';

drop policy if exists "owner_expense_receipts_owner_select" on storage.objects;
drop policy if exists "owner_expense_receipts_owner_insert" on storage.objects;
drop policy if exists "owner_expense_receipts_owner_delete_unused" on storage.objects;

drop function if exists public.owner_recurring_expenses_due(date);
drop function if exists public.owner_mark_recurring_expense_paid(uuid, date, uuid, bigint, date, text);
drop function if exists public.owner_save_recurring_expense(uuid, boolean, text, bigint, integer, date, date, text, text, boolean);
drop function if exists public.owner_attach_finance_receipt(uuid, text);
drop function if exists public.owner_void_finance_entry(uuid, text);
drop function if exists public.owner_add_finance_entry(uuid, text, bigint, date, text, text, text, text, text);
drop function if exists public.owner_finance_check_day(date);
drop function if exists public.owner_finance_check_amount(bigint);
drop function if exists public.owner_finance_check_text(text, text, text);
drop function if exists public.owner_finance_check_receipt(uuid, text);
drop function if exists public.owner_finance_clean(text);
drop function if exists public.owner_recurring_due_on(date, smallint);

-- These take the table row types as arguments, so they go before the tables.
drop function if exists public.owner_finance_entry_summary(public.owner_manual_finance_entries);
drop function if exists public.owner_recurring_summary(public.owner_recurring_expenses);

drop table if exists public.owner_finance_audit;
drop table if exists public.owner_manual_finance_entries;
drop table if exists public.owner_recurring_expenses;

drop function if exists public.owner_finance_entries_guard();
drop function if exists public.owner_finance_audit_append_only();
drop function if exists public.owner_finance_today();

commit;
