begin;
create or replace function public.record_discovery_website_review(listing text,expected_website text,confirmed_website text,new_status text,reason text,evidence jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare current_website text;published_email text;published_phone text;email_source text;phone_source text;
begin
 if new_status not in ('verified','needs_review','unavailable') then raise exception 'Invalid review';end if;
 select website into current_website from public.discovery_catalog where overture_place_id=listing for update;
 if not found or current_website is distinct from expected_website then return false;end if;
 update public.discovery_catalog set website=coalesce(confirmed_website,website) where overture_place_id=listing;
 update public.discovery_catalog set website_status=new_status,website_checked_at=now() where overture_place_id=listing;
 if new_status='verified' then
   select lower(email),page->>'source' into published_email,email_source from jsonb_array_elements(evidence) page cross join lateral jsonb_array_elements_text(coalesce(page->'emails','[]')) email where email ~* '^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$' and length(email)<=254 and (page->>'source') ~ '^https?://' limit 1;
   select phone,page->>'source' into published_phone,phone_source from jsonb_array_elements(evidence) page cross join lateral jsonb_array_elements_text(coalesce(page->'phones','[]')) phone where phone ~ '^\+234[0-9]{10}$' and (page->>'source') ~ '^https?://' limit 1;
   update public.discovery_catalog set
    email=coalesce(email,published_email),phone=coalesce(phone,published_phone),
    email_evidence_url=case when email is null and published_email is not null then email_source else email_evidence_url end,
    phone_evidence_url=case when phone is null and published_phone is not null then phone_source else phone_evidence_url end,
    contact_checked_at=case when published_email is not null or published_phone is not null then now() else contact_checked_at end
   where overture_place_id=listing;
 end if;
 insert into public.discovery_website_reviews(listing_id,previous_website,confirmed_website,status,reason,evidence) values(listing,current_website,confirmed_website,new_status,reason,evidence);
 return true;
end;$$;
commit;
