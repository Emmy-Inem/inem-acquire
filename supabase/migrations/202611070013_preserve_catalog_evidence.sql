begin;

-- A source refresh can have an empty or stale contact field even though the
-- same official website has published a better one. Preserve that evidence.
create function private.preserve_catalog_website_evidence()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.email_evidence_url is not null and new.email_evidence_url is not distinct from old.email_evidence_url then
    if new.website is not distinct from old.website then
      new.email := old.email;
    else
      new.email_evidence_url := null;
    end if;
  end if;
  if old.phone_evidence_url is not null and new.phone_evidence_url is not distinct from old.phone_evidence_url then
    if new.website is not distinct from old.website then
      new.phone := old.phone;
    else
      new.phone_evidence_url := null;
    end if;
  end if;
  if new.email_evidence_url is null and new.phone_evidence_url is null then
    new.contact_checked_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.preserve_catalog_website_evidence() from public, anon, authenticated;
create trigger preserve_catalog_website_evidence
  before update on public.discovery_catalog
  for each row execute function private.preserve_catalog_website_evidence();

-- A forward rollback can drop the trigger and function without removing data.
commit;
