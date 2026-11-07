begin;
-- Public-source website candidates are separate from the lead catalog.
create table public.discovery_source_candidates (
  id text primary key,
  name text not null,
  category text,
  city text,
  region text,
  address text,
  country text not null,
  website text not null,
  industries text[] not null default '{}',
  source_release text not null,
  location_search tsvector generated always as (
    to_tsvector('simple', coalesce(city,'') || ' ' || coalesce(region,'') || ' ' || coalesce(address,''))
  ) stored,
  business_search tsvector generated always as (
    to_tsvector('simple', name || ' ' || replace(coalesce(category,''),'_',' '))
  ) stored
);
create index discovery_source_candidates_location on public.discovery_source_candidates using gin (location_search);
create index discovery_source_candidates_business on public.discovery_source_candidates using gin (business_search);
alter table public.discovery_source_candidates enable row level security;
revoke all on public.discovery_source_candidates from public, anon, authenticated;
grant select, insert, update on public.discovery_source_candidates to service_role;
commit;
