begin;
alter table public.billing_accounts add column provider_event_created bigint not null default 0;
alter table public.billing_accounts alter column status set default 'unconfigured';
update public.billing_accounts set status='unconfigured' where customer_id is null;
create function public.add_campaign_recipient(campaign uuid,org uuid,contact uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.campaigns;rid uuid;begin
 if not private.org_access(org,'write') then raise exception 'Write permission required';end if;
 select * into c from public.campaigns where id=campaign and organization_id=org for update;
 if c.id is null or c.status<>'draft' then raise exception 'Recipients can only be added to a draft';end if;
 insert into public.campaign_recipients(organization_id,campaign_id,contact_id) values(org,campaign,contact) returning id into rid;return rid;
end;$$;
revoke all on function public.add_campaign_recipient(uuid,uuid,uuid) from public,anon;
grant execute on function public.add_campaign_recipient(uuid,uuid,uuid) to authenticated;
create function public.apply_billing_event(event_key text,org uuid,customer text,subscription text,plan_name text,subscription_status text,event_created bigint,ends_at timestamptz) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.billing_accounts where organization_id=org and customer_id=customer for update;
 if not found then raise exception 'Unknown billing account';end if;
 insert into private.webhook_events(provider,event_id) values('stripe',event_key) on conflict do nothing;if not found then return false;end if;
 update public.billing_accounts set subscription_id=subscription,plan=plan_name,status=subscription_status,period_end=ends_at,provider_event_created=event_created,updated_at=now() where organization_id=org and provider_event_created<=event_created;
 return true;
end;$$;
revoke all on function public.apply_billing_event(text,uuid,text,text,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_billing_event(text,uuid,text,text,text,text,bigint,timestamptz) to service_role;
create function public.record_inbound_email(event_key text,org uuid,sender_email text,email_subject text,email_body text,external_id text) returns boolean language plpgsql security definer set search_path='' as $$
declare contact uuid;begin
 select id into contact from public.contacts where organization_id=org and lower(email)=lower(sender_email);
 if contact is null then return false;end if;
 insert into private.webhook_events(provider,event_id) values('resend',event_key) on conflict do nothing;if not found then return false;end if;
 insert into public.messages(organization_id,contact_id,direction,subject,body,provider_id) values(org,contact,'inbound',email_subject,email_body,external_id);
 if email_body ~* '^\s*(unsubscribe|stop)\s*[.!]?\s*$' then update public.contacts set consent_status='opted_out' where id=contact and organization_id=org;end if;
 return true;
end;$$;
revoke all on function public.record_inbound_email(text,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_inbound_email(text,uuid,text,text,text,text) to service_role;
commit;
