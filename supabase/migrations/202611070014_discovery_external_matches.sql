begin;

-- The server passes at most 45 public directory matches. Check all catalog rows
-- for the same name, domain, or published contact before presenting them.
create function public.existing_discovery_matches(candidate_rows jsonb, country_code text)
returns setof integer language sql stable set search_path='' as $$
  with candidates as (
    select (ordinality - 1)::integer as idx,
      regexp_replace(lower(item->>'name'), '[^[:alnum:]]', '', 'g') as name_key,
      substring(lower(item->>'website') from '^https?://(?:www\.)?([^/:?#]+)') as host,
      lower(nullif(item->>'email', '')) as email,
      nullif(regexp_replace(item->>'phone', '[^0-9]', '', 'g'), '') as phone
    from jsonb_array_elements(candidate_rows) with ordinality as items(item, ordinality)
  )
  select idx from candidates q where exists (
    select 1 from public.discovery_catalog c
    where c.country=country_code and (
      (q.name_key <> '' and regexp_replace(lower(c.name), '[^[:alnum:]]', '', 'g')=q.name_key)
      or (q.host is not null and substring(lower(c.website) from '^https?://(?:www\.)?([^/:?#]+)')=q.host
        and q.host not in ('facebook.com','instagram.com','linkedin.com','x.com','twitter.com','bit.ly','linktr.ee','wa.me','youtube.com'))
      or (q.email is not null and lower(c.email)=q.email)
      or (q.phone is not null and regexp_replace(c.phone, '[^0-9]', '', 'g')=q.phone)
    )
  );
$$;
revoke all on function public.existing_discovery_matches(jsonb,text) from public, anon, authenticated;
grant execute on function public.existing_discovery_matches(jsonb,text) to service_role;

create index discovery_catalog_name_match on public.discovery_catalog
  (country, regexp_replace(lower(name), '[^[:alnum:]]', '', 'g'));
create index discovery_catalog_website_match on public.discovery_catalog
  (country, substring(lower(website) from '^https?://(?:www\.)?([^/:?#]+)'));
create index discovery_catalog_email_match on public.discovery_catalog (country, lower(email));
create index discovery_catalog_phone_match on public.discovery_catalog
  (country, regexp_replace(phone, '[^0-9]', '', 'g'));

commit;
