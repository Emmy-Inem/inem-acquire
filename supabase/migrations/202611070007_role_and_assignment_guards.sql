begin;

-- A typo/new capability must not fall through to read access (including support).
create or replace function private.org_access(org uuid, capability text default 'read')
returns boolean language sql stable security definer set search_path='' as $$
 select capability in ('read','write','approve','manage') and (
   exists(select 1 from public.memberships m
     where m.organization_id=org and m.user_id=(select auth.uid()) and
       case capability
         when 'read' then true
         when 'manage' then m.role in ('owner','admin')
         when 'write' then m.role in ('owner','admin','manager','member')
         when 'approve' then m.role in ('owner','admin','manager')
         else false
       end)
   or (private.is_platform_owner() and exists(
     select 1 from public.support_sessions s
     where s.organization_id=org and s.user_id=(select auth.uid())
       and s.ended_at is null and s.expires_at>now()))
 );
$$;

-- A profile may exist globally without belonging to this organization.
create function private.task_assignee_membership() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.assigned_to is not null and not exists(
   select 1 from public.memberships
   where organization_id=new.organization_id and user_id=new.assigned_to
 ) then
   raise exception using errcode='23503', message='Assign the task to a member of this organization';
 end if;
 return new;
end;
$$;
revoke all on function private.task_assignee_membership() from public,anon,authenticated;
create trigger task_assignee_membership before insert or update of assigned_to,organization_id
 on public.tasks for each row execute function private.task_assignee_membership();

-- Draft removal is a single locked transaction, so approval/delivery cannot
-- race a browser-side status check. Never erase delivery history.
create function public.delete_draft_campaign(campaign uuid,campaign_org uuid)
returns void language plpgsql security definer set search_path='' as $$
declare item public.campaigns;
begin
 if not private.org_access(campaign_org,'approve') then
   raise exception using errcode='42501', message='Campaign deletion permission required';
 end if;
 select * into item from public.campaigns
 where id=campaign and organization_id=campaign_org for update;
 if item.id is null then raise exception using errcode='P0002',message='Campaign not found';end if;
 if item.status<>'draft' or exists(
   select 1 from public.campaign_recipients where campaign_id=campaign and status<>'pending'
 ) or exists(select 1 from public.messages where campaign_id=campaign) then
   raise exception using errcode='55000',message='Only an unsent draft campaign can be deleted';
 end if;
 delete from public.campaigns where id=campaign and organization_id=campaign_org;
end;
$$;
revoke all on function public.delete_draft_campaign(uuid,uuid) from public,anon;
grant execute on function public.delete_draft_campaign(uuid,uuid) to authenticated;

-- Match adding recipients: writers may remove only pending recipients from a
-- draft. Lock the campaign first, as approval/addition/delivery do.
create function public.remove_draft_campaign_recipient(recipient uuid,recipient_org uuid)
returns void language plpgsql security definer set search_path='' as $$
declare campaign_id uuid;item public.campaigns;recipient_status text;contact uuid;
begin
 if not private.org_access(recipient_org,'write') then
   raise exception using errcode='42501',message='Write permission required';
 end if;
 select r.campaign_id into campaign_id from public.campaign_recipients r
 where r.id=recipient and r.organization_id=recipient_org;
 if campaign_id is null then raise exception using errcode='P0002',message='Recipient not found';end if;
 select * into item from public.campaigns c
 where c.id=campaign_id and c.organization_id=recipient_org for update;
 if item.id is null then raise exception using errcode='P0002',message='Campaign not found';end if;
 select r.status,r.contact_id into recipient_status,contact from public.campaign_recipients r
 where r.id=recipient and r.organization_id=recipient_org and r.campaign_id=item.id for update;
 if recipient_status is null then raise exception using errcode='P0002',message='Recipient not found';end if;
 if item.status<>'draft' or recipient_status<>'pending' or exists(
   select 1 from public.messages m where m.campaign_id=item.id and m.contact_id=contact
 ) then
   raise exception using errcode='55000',message='Only pending recipients in an unsent draft can be removed';
 end if;
 delete from public.campaign_recipients where id=recipient and organization_id=recipient_org;
end;
$$;
revoke all on function public.remove_draft_campaign_recipient(uuid,uuid) from public,anon;
grant execute on function public.remove_draft_campaign_recipient(uuid,uuid) to authenticated;

commit;
