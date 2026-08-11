-- =====================================================================
-- 20260811150000_bigice_document.sql
-- ISSUED DOCUMENT LEDGER — what was generated, what was sent, and what
-- it actually said.
--
-- WHY THE RENDERED HTML IS STORED, not a template reference:
-- §21 requires that a previously issued document does not silently
-- change when its template is updated. A reference to
-- "BIGICE-PACK-v1 + these variables" only satisfies that if every
-- version of the rendering code is kept forever and stays bug-compatible
-- — which is a promise no codebase keeps. Storing the artifact makes the
-- guarantee structural: the row IS the document the family received.
-- These are a few KB of text each.
--
-- WHY THE DELIVERY STATE IS SEPARATE FROM GENERATION:
-- §52 distinguishes "generated" from "email sent", because an
-- administrator's real question is which families never actually
-- received their pack. Rows are written BEFORE the send is attempted, so
-- a failed send leaves evidence of what should have gone out rather than
-- no trace at all.
--
-- IDEMPOTENT PER PAYMENT: (biif_code, slug, mpesa_receipt) is unique, so
-- a settlement retry re-renders onto the same rows instead of stacking
-- duplicate welcome letters. NULLS NOT DISTINCT covers manual re-issues,
-- which carry no receipt.
--
-- RLS: policy class D. A parent reads their documents through
-- /api/v1/portal, which is scoped to their own athletes; nothing here is
-- reachable with an anon or authenticated key.
-- =====================================================================

create table if not exists public.bigice_document (
  document_id      uuid primary key default gen_random_uuid(),
  biif_code        text not null references public.bigice_athlete(biif_code) on delete cascade,
  enrollment_id    uuid references public.bigice_enrollment(enrollment_id) on delete set null,

  slug             text not null,          -- receipt | welcome | portal-instructions | ...
  title            text not null,
  template_version text not null,          -- BIGICE-PACK-v1
  content_html     text not null,          -- the artifact exactly as issued
  audience         text not null default 'NEW' check (audience in ('NEW','RETURNING')),

  mpesa_receipt    text,
  issued_at        timestamptz not null default now(),

  delivery_status  text not null default 'PENDING'
                     check (delivery_status in ('PENDING','SENT','FAILED')),
  delivery_detail  text,                   -- why a send failed, for an administrator
  delivered_at     timestamptz
);

create unique index if not exists uq_bigice_document_issue
  on public.bigice_document (biif_code, slug, mpesa_receipt) nulls not distinct;

create index if not exists idx_bigice_document_athlete
  on public.bigice_document (biif_code, issued_at desc);

-- The administrator's actual query: who paid and never got their pack.
create index if not exists idx_bigice_document_undelivered
  on public.bigice_document (delivery_status)
  where delivery_status <> 'SENT';

do $$
begin
  execute 'alter table public.bigice_document enable row level security';
  execute 'revoke all on public.bigice_document from anon, authenticated';
  execute 'grant all on public.bigice_document to service_role';
end $$;
