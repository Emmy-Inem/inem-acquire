begin;

create table if not exists private.integration_secrets (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'resend', 'apollo', 'stripe')),
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_hint text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider)
);

revoke all on table private.integration_secrets from public, anon, authenticated;
grant all on table private.integration_secrets to service_role;

create or replace function public.save_organization_integration_secret(
  target_org uuid,
  provider_name text,
  secret_ciphertext text,
  secret_iv text,
  secret_tag text,
  masked_hint text,
  public_metadata jsonb,
  actor_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if provider_name not in ('gemini', 'resend', 'apollo', 'stripe') then
    raise exception 'Unsupported integration provider';
  end if;
  insert into private.integration_secrets (
    organization_id, provider, ciphertext, iv, auth_tag, key_hint, metadata, updated_by, updated_at
  ) values (
    target_org, provider_name, secret_ciphertext, secret_iv, secret_tag, coalesce(masked_hint, ''), coalesce(public_metadata, '{}'::jsonb), actor_id, now()
  )
  on conflict (organization_id, provider) do update set
    ciphertext = excluded.ciphertext,
    iv = excluded.iv,
    auth_tag = excluded.auth_tag,
    key_hint = excluded.key_hint,
    metadata = excluded.metadata,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.integration_connections (organization_id, provider, status)
  values (target_org, provider_name, 'connected')
  on conflict (organization_id, provider) do update set
    status = 'connected';

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, details)
  values (target_org, actor_id, 'integration.connected', 'integration_connections', provider_name, jsonb_build_object('provider', provider_name, 'hint', coalesce(masked_hint, '')));
end;
$$;

revoke all on function public.save_organization_integration_secret(uuid, text, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_organization_integration_secret(uuid, text, text, text, text, text, jsonb, uuid) to service_role;

create or replace function public.get_organization_integration_secrets(target_org uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider', provider,
        'ciphertext', ciphertext,
        'iv', iv,
        'auth_tag', auth_tag,
        'key_hint', key_hint,
        'metadata', metadata,
        'updated_at', updated_at
      )
    ),
    '[]'::jsonb
  )
  from private.integration_secrets
  where organization_id = target_org;
$$;

revoke all on function public.get_organization_integration_secrets(uuid) from public, anon, authenticated;
grant execute on function public.get_organization_integration_secrets(uuid) to service_role;

create or replace function public.delete_organization_integration_secret(
  target_org uuid,
  provider_name text,
  actor_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.integration_secrets
  where organization_id = target_org and provider = provider_name;

  insert into public.integration_connections (organization_id, provider, status)
  values (target_org, provider_name, 'disconnected')
  on conflict (organization_id, provider) do update set
    status = 'disconnected';

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, details)
  values (target_org, actor_id, 'integration.disconnected', 'integration_connections', provider_name, jsonb_build_object('provider', provider_name));
end;
$$;

revoke all on function public.delete_organization_integration_secret(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.delete_organization_integration_secret(uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
