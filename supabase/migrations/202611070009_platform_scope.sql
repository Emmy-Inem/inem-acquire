begin;

-- A support session is explicitly selected and can only be used for its
-- organization. Ordinary requests use membership permissions exclusively.
create or replace function private.org_access(org uuid, capability text default 'read')
returns boolean language sql stable security definer set search_path='' as $$
 with scope as (
   select nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-support-session-id' as session_id
 )
 select case when scope.session_id is null then exists(
   select 1 from public.memberships m
   where m.organization_id=org and m.user_id=(select auth.uid()) and
     case capability
       when 'read' then true
       when 'manage' then m.role in ('owner','admin')
       when 'write' then m.role in ('owner','admin','manager','member')
       when 'approve' then m.role in ('owner','admin','manager')
       else false
     end
 )
 else capability in ('read','write') and private.is_platform_owner() and exists(
   select 1 from public.support_sessions s
   where s.organization_id=org and s.user_id=(select auth.uid())
     and s.id::text=scope.session_id and s.ended_at is null and s.expires_at>now()
     and not exists (
       select 1 from public.memberships m
       where m.organization_id=org and m.user_id=s.user_id
     )
 )
 end from scope;
$$;

-- The platform directory selects a limited set of fields after its server
-- role check. Private organization rows and audit logs use tenant access.
drop policy org_read on public.organizations;
create policy org_read on public.organizations for select to authenticated
  using (private.org_access(id));
drop policy audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated
  using (private.org_access(organization_id,'manage'));

create or replace function public.start_support_session(org uuid,support_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not private.is_platform_owner() then
   raise exception using errcode='42501', message='Platform owner required';
 end if;
 if support_reason is null or length(trim(support_reason)) not between 10 and 500 then
   raise exception using errcode='22023', message='Provide a reason for support access';
 end if;
 if exists (select 1 from public.memberships where organization_id=org and user_id=auth.uid()) then
   raise exception using errcode='42501', message='Open this organization using your membership';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || org::text, 0));
 update public.support_sessions set ended_at=now()
 where organization_id=org and user_id=auth.uid() and ended_at is null;
 insert into public.support_sessions(organization_id,user_id,reason)
 values(org,auth.uid(),trim(support_reason)) returning id into sid;
 insert into public.audit_events(organization_id,actor_id,action,details)
 values(org,auth.uid(),'support.started',jsonb_build_object('reason',trim(support_reason),'session_id',sid));
 return sid;
end;
$$;

-- A forward rollback would restore the previous function and policies from
-- migrations 001, 006, and 007. It would also restore broader support access.
commit;
