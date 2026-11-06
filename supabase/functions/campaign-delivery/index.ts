import { z } from 'npm:zod@4';
import {context,permission,checked,json,fail,HttpError} from '../_shared/http.ts';
const schema=z.object({organization_id:z.string().uuid(),campaign_id:z.string().uuid()}).strict();
Deno.serve(async req=>{try{
 if(req.method!=='POST')throw new HttpError(405,'POST required');const {db,admin,user}=await context(req);const {organization_id:org,campaign_id:id}=schema.parse(await req.json());await permission(db,org,'approve');
 const key=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('OUTBOUND_FROM');if(!key||!from)throw new HttpError(503,'Email delivery is not configured. Connect a verified sender before sending.');
 const limit=checked(await admin.rpc('rate_limit_consume',{bucket:`send:${org}`,max_count:5,window_seconds:3600}));if(!limit)throw new HttpError(429,'Campaign sending limit reached. Try again later.');
 const campaign=checked(await db.from('campaigns').select('*').eq('organization_id',org).eq('id',id).single());if(campaign.status!=='approved'||!campaign.approved_by)throw new HttpError(409,'A manager must approve this campaign before sending');
 const recipients=checked(await db.from('campaign_recipients').select('id,contact_id').eq('organization_id',org).eq('campaign_id',id).eq('status','pending').limit(11));if(!recipients.length)throw new HttpError(400,'Add recipients before sending');if(recipients.length>10)throw new HttpError(400,'Split this campaign into batches of at most 10 recipients');
 const contacts=checked(await db.from('contacts').select('id,email,full_name,consent_status').eq('organization_id',org).in('id',recipients.map((r:any)=>r.contact_id)));if(contacts.some((c:any)=>c.consent_status!=='opted_in'||!c.email)||contacts.length!==recipients.length)throw new HttpError(400,'Every recipient must have an email and a recorded opt-in');
 const claimed=checked(await admin.from('campaigns').update({status:'sending'}).eq('organization_id',org).eq('id',id).eq('status','approved').eq('updated_at',campaign.updated_at).select('id'));if(!claimed.length)throw new HttpError(409,'Campaign has changed or is already sending');
 const job=checked(await admin.from('jobs').insert({organization_id:org,type:'campaign.delivery',status:'running'}).select('id').single());let sent=0,failed=0;
 for(const recipient of recipients){
  const contact=checked(await db.from('contacts').select('id,email,consent_status').eq('organization_id',org).eq('id',recipient.contact_id).single());if(contact.consent_status!=='opted_in'){failed++;continue;}const claim=checked(await admin.from('campaign_recipients').update({status:'processing'}).eq('organization_id',org).eq('id',recipient.id).eq('status','pending').select('id'));if(!claim.length)continue;
  try{
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`acquire-${recipient.id}`},body:JSON.stringify({from,to:[contact.email],subject:campaign.subject,...(Deno.env.get('INBOUND_DOMAIN')?{reply_to:`reply+${org}@${Deno.env.get('INBOUND_DOMAIN')}`} : {}),text:campaign.body+'\n\nTo stop receiving these messages, reply with unsubscribe.'}),signal:AbortSignal.timeout(15000)});
   const result=await response.json();if(!response.ok)throw new Error('Email provider rejected delivery');
   checked(await admin.from('campaign_recipients').update({status:'sent',provider_id:result.id}).eq('id',recipient.id).eq('organization_id',org));checked(await admin.from('messages').insert({organization_id:org,contact_id:contact.id,campaign_id:id,direction:'outbound',subject:campaign.subject,body:campaign.body,provider_id:result.id}));sent++;
  }catch{failed++;await admin.from('campaign_recipients').update({status:'failed',last_error:'Delivery could not be confirmed. Review the provider before retrying.'}).eq('id',recipient.id).eq('organization_id',org);}
 }
 checked(await admin.from('campaigns').update({status:failed?'failed':'sent'}).eq('id',id).eq('organization_id',org));checked(await admin.from('jobs').update({status:failed?'failed':'complete',result:{sent,failed}}).eq('id',job.id));checked(await admin.from('audit_events').insert({organization_id:org,actor_id:user.id,action:'campaign.sent',entity_type:'campaigns',entity_id:id,details:{sent,failed}}));return json({sent,failed,job_id:job.id});
 }catch(e){return fail(e)}});
