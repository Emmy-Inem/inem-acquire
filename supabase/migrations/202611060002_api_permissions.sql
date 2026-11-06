begin;
create function public.organization_permissions(org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('read',private.org_access(org),'write',private.org_access(org,'write'),'approve',private.org_access(org,'approve'),'manage',private.org_access(org,'manage'));
$$;
revoke all on function public.organization_permissions(uuid) from public,anon;
grant execute on function public.organization_permissions(uuid) to authenticated;
create function public.consume_webhook(provider_name text,event_key text) returns boolean language plpgsql security definer set search_path='' as $$
begin insert into private.webhook_events(provider,event_id) values(provider_name,event_key) on conflict do nothing;return found;end;$$;
revoke all on function public.consume_webhook(text,text) from public,anon,authenticated;
grant execute on function public.consume_webhook(text,text) to service_role;
-- Campaign edits must invalidate approval and cannot alter an in-flight send.
create function public.edit_campaign(campaign uuid, campaign_org uuid, new_name text,new_subject text,new_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.campaigns;begin
 if not private.org_access(campaign_org,'write') then raise exception 'Write permission required';end if;
 select * into c from public.campaigns where id=campaign and organization_id=campaign_org for update;
 if c.id is null or c.status not in ('draft','approved','paused','failed') then raise exception 'Campaign cannot be edited in its current state';end if;
 update public.campaigns set name=new_name,subject=new_subject,body=new_body,status='draft',approved_by=null,approved_at=null where id=campaign;return campaign;
end;$$;
revoke all on function public.edit_campaign(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.edit_campaign(uuid,uuid,text,text,text) to authenticated;
commit;
