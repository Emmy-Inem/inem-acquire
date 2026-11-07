begin;
alter table public.discovery_catalog
  add column website_status text not null default 'unreviewed'
    check(website_status in ('unreviewed','verified','needs_review','unavailable')),
  add column website_checked_at timestamptz;
create index discovery_catalog_website_check on public.discovery_catalog(website_status,website_checked_at)
 where website is not null;
-- Revert callers before dropping the validation fields in a forward migration.
commit;
