begin;
-- Keep the audit trail even when a workspace is removed by an operator.
alter table public.audit_events drop constraint audit_events_organization_id_fkey;
drop policy tenant_read on public.invitations;
create policy invitations_manage_read on public.invitations for select to authenticated using(private.org_access(organization_id,'manage'));
-- Do not accept arbitrary object changes as a way of transferring records between tenants.
create function private.immutable_tenant() returns trigger language plpgsql set search_path='' as $$begin
 if new.organization_id is distinct from old.organization_id then raise exception 'A record cannot be moved between organizations';end if;return new;
end;$$;
do $$declare t text;begin foreach t in array array['offers','icps','prospects','contacts','lists','list_contacts','campaigns','campaign_recipients','messages','deals','tasks','diagnoses','reports','documents','invitations','jobs'] loop
 execute format('create trigger immutable_tenant before update on public.%I for each row execute function private.immutable_tenant()',t);
end loop;end;$$;
revoke all on function private.immutable_tenant() from public,anon;
commit;
