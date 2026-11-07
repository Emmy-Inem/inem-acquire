begin;

-- Return a conflict without triggering transaction retry handling.
create or replace function public.set_platform_organization_operations(
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
    raise exception using errcode='PT409', message='Organization operations were updated';
  end if;
  insert into public.platform_organization_operations(organization_id,status,internal_note,updated_by)
  values(target_org,next_status,next_note,auth.uid())
  on conflict(organization_id) do update set status=excluded.status, internal_note=excluded.internal_note,
    updated_by=excluded.updated_by, updated_at=clock_timestamp();
  insert into public.platform_organization_events(organization_id,actor_id,status,note_changed)
  values(target_org,auth.uid(),next_status,coalesce(previous.internal_note, '')<>next_note);
end;
$$;

commit;
