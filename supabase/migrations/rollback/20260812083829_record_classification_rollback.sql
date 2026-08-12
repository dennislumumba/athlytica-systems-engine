-- =====================================================================
-- ROLLBACK for 20260812083829_record_classification (M2, D-22)
--
-- STATUS: written, NOT executed. Kept alongside the forward migration so
-- the change is reversible on demand.
--
-- WHAT THIS UNDOES
--   Removes the classification of the 5 synthetic payment_events and
--   drops the table. `payment_events` itself was never touched by the
--   forward migration, so there is nothing to restore there.
--
-- CONSEQUENCE OF RUNNING IT
--   KES 658,000 of synthetic settlements become indistinguishable from
--   real revenue again — which is the condition D-22 exists to end.
--   Roll forward (correct a classification) in preference to rolling back.
--
-- SAFETY
--   Non-destructive to production data by construction: the only rows
--   deleted are classification metadata created by the forward migration.
--   Reversible by re-running the forward migration.
-- =====================================================================

begin;

-- Refuse if anything outside the M2 scope has been classified since.
-- Rolling back would then silently delete someone else's work.
do $$
declare n_foreign bigint;
begin
  if to_regclass('public.record_classification') is null then
    raise notice 'record_classification does not exist; nothing to roll back.';
    return;
  end if;

  select count(*) into n_foreign
    from public.record_classification
   where classified_by not like 'phase-0.3-M2%';

  if n_foreign > 0 then
    raise exception
      'ROLLBACK REFUSED: % classification row(s) were created outside M2. Dropping the table would delete them. Remove the M2 rows individually instead.',
      n_foreign;
  end if;
end $$;

-- Targeted removal first, so the intent is explicit in the audit trail
-- even though the table is dropped immediately after.
delete from public.record_classification
 where record_table = 'payment_events'
   and record_id in ('AUDITTEST001','AUDITTEST002','AUDITTEST003',
                     'AUDITTEST004','SGX7HQ2LM9')
   and classified_by like 'phase-0.3-M2%';

drop index if exists public.idx_record_classification_lookup;
drop table if exists public.record_classification;

do $$
begin
  raise warning
    'ROLLBACK COMPLETE. The 5 synthetic payment_events (KES 658,000) are once again indistinguishable from production revenue. Re-apply 20260812083829_record_classification as soon as the blocking issue is resolved.';
end $$;

commit;

-- =====================================================================
-- VERIFY AFTER ROLLBACK
--   select to_regclass('public.record_classification');   -- expect null
--   select count(*) from public.payment_events;           -- expect 5 (unchanged)
-- =====================================================================
