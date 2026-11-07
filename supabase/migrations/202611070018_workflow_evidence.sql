begin;
alter table public.organizations add column if not exists logo_path text;
alter table public.prospects add column if not exists email text;
alter table public.prospects add column if not exists phone text;
alter table public.contacts add column if not exists phone text;
alter table public.contacts add column if not exists notes text not null default '';
update storage.buckets set allowed_mime_types=array['application/pdf','text/plain','text/csv','image/png','image/jpeg','image/webp'] where id='organization-documents';
create table if not exists public.discovery_website_reviews (
 id uuid primary key default gen_random_uuid(), listing_id text not null references public.discovery_catalog(overture_place_id) on delete cascade,
 previous_website text, confirmed_website text, status text not null, reason text, evidence jsonb not null default '[]', checked_at timestamptz not null default now()
);
alter table public.discovery_website_reviews enable row level security;
revoke all on public.discovery_website_reviews from anon,authenticated;
grant all on public.discovery_website_reviews to service_role;
create index if not exists discovery_website_reviews_listing on public.discovery_website_reviews(listing_id,checked_at desc);
commit;
