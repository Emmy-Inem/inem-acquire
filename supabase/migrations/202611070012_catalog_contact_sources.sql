begin;

alter table public.discovery_catalog
  add column listing_source text not null default 'Overture'
    check (listing_source in ('Overture', 'Foursquare')),
  add column email_evidence_url text,
  add column phone_evidence_url text,
  add column contact_checked_at timestamptz;

comment on column public.discovery_catalog.overture_place_id is
  'Stable catalog identifier. Foursquare listings are prefixed with fsq:.';
comment on column public.discovery_catalog.contact_checked_at is
  'Date published contact details were observed on the linked business website.';

-- Existing rows inherit their original source. Revert callers before removing these fields.
commit;
