begin;
create function public.record_discovery_website_review(listing text,expected_website text,confirmed_website text,new_status text,reason text,evidence jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare current_website text;
begin
 if new_status not in ('verified','needs_review','unavailable') then raise exception 'Invalid review';end if;
 select website into current_website from public.discovery_catalog where overture_place_id=listing for update;
 if not found or current_website is distinct from expected_website then return false;end if;
 update public.discovery_catalog set website=coalesce(confirmed_website,website) where overture_place_id=listing;
 -- A changed URL first invalidates its old status via the existing trigger.
 update public.discovery_catalog set website_status=new_status,website_checked_at=now() where overture_place_id=listing;
 insert into public.discovery_website_reviews(listing_id,previous_website,confirmed_website,status,reason,evidence) values(listing,current_website,confirmed_website,new_status,reason,evidence);
 return true;
end;$$;
revoke all on function public.record_discovery_website_review(text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_discovery_website_review(text,text,text,text,text,jsonb) to service_role;
create table public.research_usage(organization_id uuid not null references public.organizations(id) on delete cascade,period date not null,used integer not null default 0 check(used>=0),primary key(organization_id,period));
alter table public.research_usage enable row level security;
create policy research_usage_read on public.research_usage for select to authenticated using(private.org_access(organization_id));
grant select on public.research_usage to authenticated;
grant all on public.research_usage to service_role;
create function public.reserve_research_credits(org uuid,units integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare p date:=date_trunc('month',now())::date; allowance integer;spent integer;plan_name text;
begin
 if units<0 or units>50 then raise exception 'Invalid research batch';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,91));
 select plan into plan_name from public.billing_accounts where organization_id=org;
 allowance:=case when plan_name='growth' then 2500 when plan_name='scale' then 100000 else 500 end;
 insert into public.research_usage(organization_id,period) values(org,p) on conflict do nothing;
 select used into spent from public.research_usage where organization_id=org and period=p for update;
 if spent+units>allowance then return jsonb_build_object('allowed',false,'used',spent,'limit',allowance,'remaining',greatest(0,allowance-spent),'period',p);end if;
 update public.research_usage set used=used+units where organization_id=org and period=p;
 return jsonb_build_object('allowed',true,'used',spent+units,'limit',allowance,'remaining',greatest(0,allowance-spent-units),'period',p);
end;$$;
revoke all on function public.reserve_research_credits(uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_research_credits(uuid,integer) to service_role;
alter table public.offers add column status text not null default 'active' check(status in ('active','archived'));
create function private.enforce_active_targets() returns trigger language plpgsql security definer set search_path='' as $$
declare plan_name text;existing_count integer;
begin
 if new.status<>'active' then return new;end if;
 if TG_OP='UPDATE' and old.status='active' then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,92));
 select plan into plan_name from public.billing_accounts where organization_id=new.organization_id;
 if coalesce(plan_name,'starter')<>'starter' then return new;end if;
 if TG_TABLE_NAME='offers' then select count(*) into existing_count from public.offers where organization_id=new.organization_id and status='active' and id<>new.id;
 else select count(*) into existing_count from public.icps where organization_id=new.organization_id and status='active' and id<>new.id;end if;
 if existing_count>=1 then raise exception 'Starter includes one active offer and one active customer profile. Archive the previous one or change plan.';end if;
 return new;
end;$$;
create trigger enforce_offer_allowance before insert or update of status on public.offers for each row execute function private.enforce_active_targets();
create trigger enforce_icp_allowance before insert or update of status on public.icps for each row execute function private.enforce_active_targets();
create function public.create_plan_invitation(org uuid,address text,member_role public.org_role,hash text,actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare plan_name text;seats integer;occupied integer;invitation public.invitations;
begin
 perform pg_advisory_xact_lock(hashtextextended(org::text,93));
 select plan into plan_name from public.billing_accounts where organization_id=org;
 seats:=case when plan_name='growth' then 5 when plan_name='scale' then 100000 else 2 end;
 select (select count(*) from public.memberships where organization_id=org)+(select count(*) from public.invitations where organization_id=org and accepted_at is null and expires_at>now()) into occupied;
 if occupied>=seats then raise exception 'Your plan has no available team seats. Revoke an unused invitation or change plan.';end if;
 if exists(select 1 from public.invitations where organization_id=org and lower(email)=lower(address) and accepted_at is null and expires_at>now()) then raise exception 'An active invitation already exists for this email.';end if;
 insert into public.invitations(organization_id,email,role,token_hash,invited_by) values(org,lower(address),member_role,hash,actor) returning * into invitation;
 return jsonb_build_object('id',invitation.id,'email',invitation.email,'role',invitation.role,'expires_at',invitation.expires_at);
end;$$;
revoke all on function public.create_plan_invitation(uuid,text,public.org_role,text,uuid) from public,anon,authenticated;
grant execute on function public.create_plan_invitation(uuid,text,public.org_role,text,uuid) to service_role;
commit;
