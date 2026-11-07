begin;
create function private.invalidate_catalog_website_check()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.website is distinct from new.website then
    new.website_status := 'unreviewed';
    new.website_checked_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.invalidate_catalog_website_check() from public,anon,authenticated;
create trigger invalidate_catalog_website_check before update of website on public.discovery_catalog
  for each row execute function private.invalidate_catalog_website_check();
-- A forward rollback can drop this trigger and function.
commit;
