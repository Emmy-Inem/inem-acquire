begin;

create table public.discovery_catalog (
  overture_place_id text primary key,
  name text not null,
  category text,
  category_group text,
  industries text[] not null default '{}',
  phone text,
  email text,
  website text,
  city text,
  region text,
  address text,
  country text not null check (country ~ '^[A-Z]{2}$'),
  operating_status text,
  source_release text not null,
  upstream_sources text not null,
  source_licenses text not null,
  needs_review boolean not null,
  location_search tsvector generated always as (
    to_tsvector('simple', coalesce(city, '') || ' ' || coalesce(region, '') || ' ' || coalesce(address, ''))
  ) stored,
  business_search tsvector generated always as (
    to_tsvector('simple', name || ' ' || replace(coalesce(category, ''), '_', ' ') || ' ' || replace(coalesce(category_group, ''), '_', ' '))
  ) stored,
  check (phone is not null or email is not null)
);

alter table public.discovery_catalog enable row level security;
revoke all on public.discovery_catalog from public, anon, authenticated;
grant select, insert, update on public.discovery_catalog to service_role;

create index discovery_catalog_location on public.discovery_catalog using gin (location_search);
create index discovery_catalog_business on public.discovery_catalog using gin (business_search);
create index discovery_catalog_industries on public.discovery_catalog using gin (industries);
create index discovery_catalog_order on public.discovery_catalog (country, needs_review, name, overture_place_id);

-- Roll back by removing callers first, then dropping the catalog in a forward migration.
commit;
