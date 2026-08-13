-- =====================================================================
-- ROLLBACK — CRM CORE
--
-- Drops the six CRM tables, their four trigger functions, and the one
-- trigger this migration attached to an existing table.
--
-- TOUCHES NO EXISTING DATA. The only edit outside the crm_* namespace is
-- `registrations_crm_settlement_won`, a trigger this migration created;
-- dropping it restores registrations to its pre-CRM behaviour exactly.
-- payment_events, registrations rows, athlete and record_classification
-- are not read or written here.
--
-- DESTRUCTIVE: cascading the tables destroys the commercial history in
-- crm_opportunity_event. Export it first if the pipeline has been used:
--   copy (select * from public.crm_opportunity_event) to stdout csv header;
-- =====================================================================

drop trigger if exists registrations_crm_settlement_won on public.registrations;

drop table if exists public.crm_opportunity_event cascade;
drop table if exists public.crm_task cascade;
drop table if exists public.crm_activity cascade;
drop table if exists public.crm_opportunity cascade;
drop table if exists public.crm_contact cascade;
drop table if exists public.crm_organization cascade;

drop function if exists public.trg_crm_settlement_won();
drop function if exists public.trg_crm_opportunity_next_action();
drop function if exists public.trg_crm_opportunity_audit();
drop function if exists public.trg_crm_opportunity_close();

-- public.trg_touch_updated_at() is NOT dropped: it predates this
-- migration and registrations still uses it.
