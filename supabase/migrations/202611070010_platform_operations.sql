begin;

create table public.platform_organization_operations (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  status text not null check (status in ('routine', 'attention', 'monitoring')),
  internal_note text not null check (length(internal_note) <= 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.platform_organization_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  status text not null check (status in ('routine', 'attention', 'monitoring')),
  note_changed boolean not null,
  created_at timestamptz not null default now()
);

create index platform_organization_events_recent
  on public.platform_organization_events(organization_id, id desc);
create index platform_organization_operations_status
  on public.platform_organization_operations(status);

alter table public.platform_organization_operations enable row level security;
alter table public.platform_organization_events enable row level security;
revoke all on public.platform_organization_operations, public.platform_organization_events
  from public, anon, authenticated;
grant select on public.platform_organization_operations, public.platform_organization_events to service_role;

create view public.platform_organization_directory with (security_invoker=true) as
select o.id, o.name, o.industry, o.website, o.created_at,
       coalesce(ops.status, 'routine') as operation_status,
       (select count(*) from public.memberships m where m.organization_id=o.id) as member_count
from public.organizations o
left join public.platform_organization_operations ops on ops.organization_id=o.id;

revoke all on public.platform_organization_directory from public, anon, authenticated;
grant select on public.platform_organization_directory to service_role;

create function public.set_platform_organization_operations(
  target_org uuid, next_status text, next_note text, expected_updated_at timestamptz
) returns void language plpgsql security definer set search_path='' as $$
declare previous public.platform_organization_operations;
begin
  if not private.is_platform_owner() then
    raise exception using errcode='42501', message='Platform owner required';
  end if;
  if next_status is null or next_status not in ('routine', 'attention', 'monitoring')
     or next_note is null or length(next_note)>2000 then
    raise exception using errcode='22023', message='Invalid organization operations values';
  end if;
  perform 1 from public.organizations where id=target_org for update;
  if not found then
    raise exception using errcode='P0002', message='Organization not found';
  end if;
  select * into previous from public.platform_organization_operations where organization_id=target_org;
  if coalesce(previous.status, 'routine')=next_status
     and coalesce(previous.internal_note, '')=next_note then
    return;
  end if;
  if previous.updated_at is distinct from expected_updated_at then
    raise exception using errcode='40001', message='Organization operations were updated';
  end if;
  insert into public.platform_organization_operations(organization_id,status,internal_note,updated_by)
  values(target_org,next_status,next_note,auth.uid())
  on conflict(organization_id) do update set status=excluded.status, internal_note=excluded.internal_note,
    updated_by=excluded.updated_by, updated_at=clock_timestamp();
  insert into public.platform_organization_events(organization_id,actor_id,status,note_changed)
  values(target_org,auth.uid(),next_status,coalesce(previous.internal_note, '')<>next_note);
end;
$$;

revoke all on function public.set_platform_organization_operations(uuid,text,text,timestamptz) from public, anon;
grant execute on function public.set_platform_organization_operations(uuid,text,text,timestamptz) to authenticated;

-- Remove the console callers before dropping these platform-only objects in a forward migration.
commit;
