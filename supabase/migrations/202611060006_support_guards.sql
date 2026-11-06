begin;
create or replace function public.end_support_session(org uuid) returns void language plpgsql security definer set search_path='' as $$
declare affected integer;begin
 if not private.is_platform_owner() then raise exception 'Platform owner required';end if;
 update public.support_sessions set ended_at=now() where organization_id=org and user_id=auth.uid() and ended_at is null;
 get diagnostics affected=row_count;
 if affected>0 then insert into public.audit_events(organization_id,actor_id,action) values(org,auth.uid(),'support.ended');end if;
end;$$;
create or replace function public.start_support_session(org uuid,support_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid;begin
 if not private.is_platform_owner() then raise exception 'Platform owner required';end if;
 if length(trim(support_reason))<10 then raise exception 'Provide a reason for support access';end if;
 update public.support_sessions set ended_at=now() where organization_id=org and user_id=auth.uid() and ended_at is null;
 insert into public.support_sessions(organization_id,user_id,reason) values(org,auth.uid(),trim(support_reason)) returning id into sid;
 insert into public.audit_events(organization_id,actor_id,action,details) values(org,auth.uid(),'support.started',jsonb_build_object('reason',trim(support_reason),'session_id',sid));return sid;
end;$$;
commit;
