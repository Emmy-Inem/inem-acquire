begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.org_role as enum ('owner','admin','manager','member','viewer');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '', created_at timestamptz not null default now()
);
create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120),
 website text, industry text, description text, settings jsonb not null default '{}',
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.memberships (
 organization_id uuid references public.organizations(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade,
 role public.org_role not null default 'member', created_at timestamptz not null default now(), primary key(organization_id,user_id)
);
create index memberships_user on public.memberships(user_id,organization_id);
create table public.platform_roles (user_id uuid primary key references public.profiles(id) on delete cascade, role text not null check(role='platform_owner'), created_at timestamptz not null default now());
create table private.platform_owner_allowlist(email text primary key check(email=lower(email)));
-- Owner identities are registered separately through the trusted deployment process.
create table public.support_sessions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), user_id uuid not null references public.profiles(id),
 reason text not null check(length(reason) between 10 and 500), expires_at timestamptz not null default now()+interval '1 hour', ended_at timestamptz, created_at timestamptz not null default now()
);
create index active_support on public.support_sessions(user_id,organization_id,expires_at) where ended_at is null;
create table public.audit_events (
 id bigint generated always as identity primary key, organization_id uuid references public.organizations(id), actor_id uuid,
 action text not null, entity_type text, entity_id text, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_org_time on public.audit_events(organization_id,created_at desc);

create function private.is_platform_owner() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.platform_roles where user_id=(select auth.uid()) and role='platform_owner');
$$;
create function private.org_access(org uuid, capability text default 'read') returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and
   case capability when 'manage' then m.role in ('owner','admin') when 'write' then m.role in ('owner','admin','manager','member') when 'approve' then m.role in ('owner','admin','manager') else true end)
 or (private.is_platform_owner() and exists(select 1 from public.support_sessions s where s.organization_id=org and s.user_id=(select auth.uid()) and s.ended_at is null and s.expires_at>now()));
$$;
create function private.bootstrap_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')) on conflict(id) do nothing;
 if new.email_confirmed_at is not null and exists(select 1 from private.platform_owner_allowlist where email=lower(new.email)) then
  insert into public.platform_roles(user_id,role) values(new.id,'platform_owner') on conflict do nothing;
 end if;
 return new;
end;$$;
create trigger acquire_profile after insert or update of email_confirmed_at on auth.users for each row execute function private.bootstrap_profile();
insert into public.profiles(id,full_name) select id,coalesce(raw_user_meta_data->>'full_name','') from auth.users on conflict do nothing;
insert into public.platform_roles(user_id,role) select u.id,'platform_owner' from auth.users u join private.platform_owner_allowlist a on a.email=lower(u.email) where u.email_confirmed_at is not null on conflict do nothing;

create table public.offers(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,name text not null,description text not null default '',price numeric(16,2) check(price>=0),currency text not null default 'NGN',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id));
create table public.icps(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,offer_id uuid,name text not null,criteria jsonb not null default '{}',status text not null default 'draft' check(status in ('draft','active','archived')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),foreign key(organization_id,offer_id) references public.offers(organization_id,id));
create table public.prospects(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,name text not null,website text,industry text,country text,source_url text,fit_score integer check(fit_score between 0 and 100),notes text not null default '',verification_status text not null default 'unverified' check(verification_status in ('unverified','verified','stale')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id));
create table public.contacts(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,prospect_id uuid,full_name text not null,email text,job_title text,consent_status text not null default 'unknown' check(consent_status in ('unknown','opted_in','legitimate_interest','opted_out')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),foreign key(organization_id,prospect_id) references public.prospects(organization_id,id));
create unique index contact_email_org on public.contacts(organization_id,lower(email)) where email is not null;
create table public.lists(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,name text not null,description text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id));
create table public.list_contacts(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,list_id uuid not null,contact_id uuid not null,created_at timestamptz not null default now(),unique(list_id,contact_id),foreign key(organization_id,list_id) references public.lists(organization_id,id) on delete cascade,foreign key(organization_id,contact_id) references public.contacts(organization_id,id) on delete cascade);
create table public.campaigns(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,name text not null,subject text not null default '',body text not null default '',status text not null default 'draft' check(status in ('draft','approved','sending','sent','paused','failed')),approved_by uuid references public.profiles(id),approved_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id));
create table public.campaign_recipients(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,campaign_id uuid not null,contact_id uuid not null,status text not null default 'pending' check(status in ('pending','processing','sent','failed','unsubscribed')),provider_id text,last_error text,created_at timestamptz not null default now(),unique(campaign_id,contact_id),foreign key(organization_id,campaign_id) references public.campaigns(organization_id,id) on delete cascade,foreign key(organization_id,contact_id) references public.contacts(organization_id,id));
create table public.messages(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,contact_id uuid,campaign_id uuid,direction text not null check(direction in ('inbound','outbound')),subject text not null default '',body text not null default '',provider_id text unique,created_at timestamptz not null default now(),foreign key(organization_id,contact_id) references public.contacts(organization_id,id),foreign key(organization_id,campaign_id) references public.campaigns(organization_id,id));
create table public.deals(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,prospect_id uuid,title text not null,value numeric(16,2) not null default 0 check(value>=0),currency text not null default 'NGN',stage text not null default 'qualified' check(stage in ('qualified','meeting','proposal','negotiation','won','lost')),expected_close date,notes text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),foreign key(organization_id,prospect_id) references public.prospects(organization_id,id));
create table public.tasks(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,deal_id uuid,title text not null,status text not null default 'open' check(status in ('open','done')),priority text not null default 'medium' check(priority in ('low','medium','high')),due_at timestamptz,assigned_to uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(organization_id,deal_id) references public.deals(organization_id,id),foreign key(organization_id,assigned_to) references public.memberships(organization_id,user_id));
create table public.diagnoses(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,score integer check(score between 0 and 100),findings jsonb not null default '[]',evidence jsonb not null default '{}',created_at timestamptz not null default now());
create table public.reports(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,name text not null,definition jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.invitations(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,email text not null,role public.org_role not null check(role<>'owner'),token_hash text not null unique,invited_by uuid not null references public.profiles(id),expires_at timestamptz not null default now()+interval '7 days',accepted_at timestamptz,created_at timestamptz not null default now());
create table public.billing_accounts(organization_id uuid primary key references public.organizations(id) on delete cascade,provider text not null default 'stripe',customer_id text unique,subscription_id text unique,plan text not null default 'starter',status text not null default 'trialing',period_end timestamptz,updated_at timestamptz not null default now());
create table public.integration_connections(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,provider text not null,status text not null default 'disconnected' check(status in ('disconnected','connected','error')),created_at timestamptz not null default now(),unique(organization_id,provider));
create table public.jobs(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,type text not null,status text not null default 'queued' check(status in ('queued','running','complete','failed')),result jsonb,last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table private.webhook_events(provider text not null,event_id text not null,created_at timestamptz not null default now(),primary key(provider,event_id));
create table private.rate_limits(key text primary key,count integer not null,reset_at timestamptz not null);
create table public.demo_requests(id uuid primary key default gen_random_uuid(),email text not null,name text not null,company text not null,message text not null default '',created_at timestamptz not null default now());

create function private.touch_updated() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end;$$;
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; begin r=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id,details) values((r->>'organization_id')::uuid,auth.uid(),lower(tg_op),tg_table_name,r->>'id',jsonb_build_object('fields',case when tg_op='UPDATE' then (select jsonb_agg(k) from jsonb_object_keys(to_jsonb(new)) k where to_jsonb(new)->k is distinct from to_jsonb(old)->k) else '[]'::jsonb end));
 return case when tg_op='DELETE' then old else new end;end;$$;
do $$declare t text;begin
 foreach t in array array['offers','icps','prospects','contacts','lists','list_contacts','campaigns','campaign_recipients','messages','deals','tasks','diagnoses','reports','invitations','billing_accounts','integration_connections','jobs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create index %I on public.%I(organization_id)',t||'_org',t);
  execute format('create policy tenant_read on public.%I for select to authenticated using(private.org_access(organization_id))',t);
  if t=any(array['offers','icps','prospects','contacts','lists','list_contacts','deals','tasks','reports']) then
   execute format('create policy tenant_insert on public.%I for insert to authenticated with check(private.org_access(organization_id,''write''))',t);
   execute format('create policy tenant_update on public.%I for update to authenticated using(private.org_access(organization_id,''write'')) with check(private.org_access(organization_id,''write''))',t);
   execute format('create policy tenant_delete on public.%I for delete to authenticated using(private.org_access(organization_id,''approve''))',t);
  end if;
  execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='updated_at') then execute format('create trigger updated_at before update on public.%I for each row execute function private.touch_updated()',t);end if;
 end loop;
end;$$;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.platform_roles enable row level security;
alter table public.support_sessions enable row level security;
alter table public.audit_events enable row level security;
alter table public.demo_requests enable row level security;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid() or exists(select 1 from public.memberships m where m.user_id=id and private.org_access(m.organization_id)));
create policy edit_profile on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy org_read on public.organizations for select to authenticated using(private.org_access(id) or private.is_platform_owner());
create policy org_update on public.organizations for update to authenticated using(private.org_access(id,'manage')) with check(private.org_access(id,'manage'));
create policy membership_read on public.memberships for select to authenticated using(user_id=auth.uid() or private.org_access(organization_id));
create policy own_platform_role on public.platform_roles for select to authenticated using(user_id=auth.uid());
create policy support_read on public.support_sessions for select to authenticated using(user_id=auth.uid() or private.org_access(organization_id,'manage'));
create policy audit_read on public.audit_events for select to authenticated using(private.org_access(organization_id,'manage') or private.is_platform_owner());

create function public.create_organization(org_name text, org_website text default null,org_industry text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Verify your email first';end if;
 if (select count(*) from public.memberships where user_id=auth.uid() and role='owner')>=10 then raise exception 'Organization limit reached';end if;
 insert into public.organizations(name,website,industry,created_by) values(trim(org_name),org_website,org_industry,auth.uid()) returning id into org;
 insert into public.memberships values(org,auth.uid(),'owner',now());
 insert into public.billing_accounts(organization_id) values(org);
 insert into public.audit_events(organization_id,actor_id,action) values(org,auth.uid(),'organization.created');return org;
end;$$;
create function public.start_support_session(org uuid, support_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid;begin
 if not private.is_platform_owner() then raise exception 'Platform owner required';end if;
 insert into public.support_sessions(organization_id,user_id,reason) values(org,auth.uid(),support_reason) returning id into sid;
 insert into public.audit_events(organization_id,actor_id,action,details) values(org,auth.uid(),'support.started',jsonb_build_object('reason',support_reason,'session_id',sid));return sid;
end;$$;
create function public.end_support_session(org uuid) returns void language plpgsql security definer set search_path='' as $$begin
 update public.support_sessions set ended_at=now() where organization_id=org and user_id=auth.uid() and ended_at is null;
 insert into public.audit_events(organization_id,actor_id,action) values(org,auth.uid(),'support.ended');end;$$;
create function public.set_member_role(org uuid, target_user uuid, new_role public.org_role) returns void language plpgsql security definer set search_path='' as $$
declare actor_role public.org_role;target_role public.org_role;begin
 select role into actor_role from public.memberships where organization_id=org and user_id=auth.uid();
 if actor_role not in ('owner','admin') or actor_role is null then raise exception 'Organization administrator required';end if;
 select role into target_role from public.memberships where organization_id=org and user_id=target_user for update;
 if target_role is null then raise exception 'Member not found';end if;
 if target_role='owner' or new_role='owner' then raise exception 'Ownership cannot be changed here';end if;
 if actor_role='admin' and (target_role='admin' or new_role='admin') then raise exception 'Owner required to manage administrators';end if;
 update public.memberships set role=new_role where organization_id=org and user_id=target_user;
 insert into public.audit_events(organization_id,actor_id,action,details) values(org,auth.uid(),'member.role_changed',jsonb_build_object('user_id',target_user,'role',new_role));end;$$;
create function public.approve_campaign(campaign uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.campaigns;begin select * into c from public.campaigns where id=campaign for update;
 if c.id is null or not private.org_access(c.organization_id,'approve') then raise exception 'Campaign approval permission required';end if;
 if c.status<>'draft' or length(c.subject)=0 or length(c.body)=0 then raise exception 'A complete draft is required';end if;
 update public.campaigns set status='approved',approved_by=auth.uid(),approved_at=now() where id=campaign;
end;$$;
create function public.rate_limit_consume(bucket text, max_count integer, window_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;begin
 insert into private.rate_limits(key,count,reset_at) values(bucket,1,now()+make_interval(secs=>window_seconds)) on conflict(key) do update set count=case when private.rate_limits.reset_at<now() then 1 else private.rate_limits.count+1 end,reset_at=case when private.rate_limits.reset_at<now() then now()+make_interval(secs=>window_seconds) else private.rate_limits.reset_at end returning count into n;return n<=max_count;
end;$$;
revoke all on function public.rate_limit_consume(text,integer,integer) from public,anon,authenticated;
grant execute on function public.rate_limit_consume(text,integer,integer) to service_role;

create function public.accept_invitation(invite_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.invitations; email_address text;begin
 select email into email_address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into inv from public.invitations where token_hash=invite_hash and accepted_at is null and expires_at>now() for update;
 if inv.id is null or lower(inv.email) is distinct from lower(email_address) then raise exception 'Invitation is invalid or belongs to a different verified email';end if;
 insert into public.memberships(organization_id,user_id,role) values(inv.organization_id,auth.uid(),inv.role) on conflict do nothing;
 update public.invitations set accepted_at=now() where id=inv.id;return inv.organization_id;
end;$$;
revoke all on all functions in schema private from public,anon;
grant execute on function private.is_platform_owner(),private.org_access(uuid,text) to authenticated;
revoke all on function public.create_organization(text,text,text),public.start_support_session(uuid,text),public.end_support_session(uuid),public.set_member_role(uuid,uuid,public.org_role),public.approve_campaign(uuid),public.accept_invitation(text) from public,anon;
grant execute on function public.create_organization(text,text,text),public.start_support_session(uuid,text),public.end_support_session(uuid),public.set_member_role(uuid,uuid,public.org_role),public.approve_campaign(uuid),public.accept_invitation(text) to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to authenticated,service_role;
revoke all on public.demo_requests from anon,authenticated;
revoke insert,update,delete on public.platform_roles,public.support_sessions,public.audit_events,public.memberships,public.invitations,public.billing_accounts,public.jobs,public.messages,public.campaign_recipients,public.diagnoses,public.integration_connections from authenticated;
grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;
notify pgrst,'reload schema';
commit;
