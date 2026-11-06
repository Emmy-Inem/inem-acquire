import { z } from 'npm:zod@4';
import {parseResource,readResources,serviceWriteResources} from '../../../shared/resources.js';
import {context,permission,checked,json,fail,HttpError} from '../_shared/http.ts';
const request=z.object({organization_id:z.string().uuid(),action:z.enum(['list','create','update','delete']),resource:z.string(),id:z.string().uuid().optional(),data:z.record(z.string(),z.unknown()).optional(),search:z.string().max(150).optional(),offset:z.number().int().min(0).max(100000).default(0),limit:z.number().int().min(1).max(100).default(50)}).strict();
Deno.serve(async req=>{try{
 if(req.method!=='POST')throw new HttpError(405,'POST required');const {db,admin,user}=await context(req);const input=request.parse(await req.json());const {organization_id:org,resource,action,id}=input;
 if(!readResources.includes(resource))throw new HttpError(404,'Resource not found');
 await permission(db,org,action==='list'?'read':action==='delete'?'approve':'write');
 if(resource==='audit_events')await permission(db,org,'manage');
 if(action==='list'){
  let query=db.from(resource).select('*',{count:'exact'}).eq('organization_id',org);
  if(input.search){const field=resource==='contacts'?'full_name':['deals','tasks'].includes(resource)?'title':['offers','icps','prospects','lists','campaigns','reports'].includes(resource)?'name':null;if(field)query=query.ilike(field,`%${input.search.replace(/[\\%_]/g,'\\$&')}%`);}
  const result=await query.order('created_at',{ascending:false}).range(input.offset,input.offset+input.limit-1);checked(result);return json({data:result.data,count:result.count});
 }
 if(action==='delete'){
  if(!id)throw new HttpError(400,'Record ID required');if(!Object.hasOwn((await import('../../../shared/resources.js')).resourceSchemas,resource))throw new HttpError(403,'This resource is managed by the platform');
  if(serviceWriteResources.includes(resource))throw new HttpError(403,'Campaign records cannot be removed here');
  const result=await db.from(resource).delete().eq('organization_id',org).eq('id',id).select('id');checked(result);if(!result.data?.length)throw new HttpError(404,'Record not found');return json({success:true});
 }
 const data=parseResource(resource,input.data||{},action==='update');
 if(action==='update'&&!id)throw new HttpError(400,'Record ID required');
 if(resource==='campaigns'&&action==='update'){
  const previous=checked(await db.from('campaigns').select('name,subject,body').eq('organization_id',org).eq('id',id).single());
  checked(await db.rpc('edit_campaign',{campaign:id,campaign_org:org,new_name:data.name??previous.name,new_subject:data.subject??previous.subject,new_body:data.body??previous.body}));
  return json({data:checked(await db.from('campaigns').select('*').eq('organization_id',org).eq('id',id).single())});
 }
 if(resource==='campaign_recipients'){
  if(action!=='create')throw new HttpError(403,'Recipient status is managed by delivery');
  const campaign=checked(await db.from('campaigns').select('status').eq('organization_id',org).eq('id',data.campaign_id).single());if(campaign.status!=='draft')throw new HttpError(409,'Recipients can only be changed on a draft');
 }
 if(resource==='campaign_recipients'){const rid=checked(await db.rpc('add_campaign_recipient',{campaign:data.campaign_id,org,contact:data.contact_id}));return json({data:{id:rid}},201);}
 const client=serviceWriteResources.includes(resource)?admin:db;
 const result=action==='create'?await client.from(resource).insert({...data,organization_id:org}).select('*').single():await client.from(resource).update(data).eq('organization_id',org).eq('id',id).select('*').single();
 const saved=checked(result);if(serviceWriteResources.includes(resource))checked(await admin.from('audit_events').insert({organization_id:org,actor_id:user.id,action:`${resource}.${action}`,entity_type:resource,entity_id:saved.id}));return json({data:saved},action==='create'?201:200);
 }catch(e){return fail(e)}});
