import { createClient } from 'npm:@supabase/supabase-js@2';
export const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
export async function context(req:Request){
 const jwt=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!jwt)throw new HttpError(401,'Sign in required');
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!;
 const supportId=req.headers.get('x-support-session-id');
 const db=createClient(url,key,{global:{headers:{Authorization:`Bearer ${jwt}`,...(supportId?{'x-support-session-id':supportId}:{})}},auth:{persistSession:false}});
 const {data:{user},error}=await db.auth.getUser(jwt);if(error||!user)throw new HttpError(401,'Session expired');
 const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 return {db,admin,user};
}
export async function permission(db:any,org:string,capability='read'){
 const {data,error}=await db.rpc('organization_permissions',{org});if(error||!data?.[capability])throw new HttpError(403,'You do not have permission for this organization');return data;
}
export function checked(result:any){if(result.error)throw new HttpError(result.error.code==='23505'||result.error.code==='55000'?409:result.error.code==='42501'?403:result.error.code==='P0002'?404:400,result.error.code==='23505'?'This record already exists':result.error.code==='23503'?'A related record is missing or belongs to another organization':result.error.code==='55000'?'Only unsent drafts and pending recipients can be removed':result.error.code==='P0002'?'Record not found':'The request could not be saved');return result.data;}
export function fail(error:unknown){if(error instanceof HttpError)return json({error:error.message},error.status);if(error&&typeof error==='object'&&'issues'in error)return json({error:'Check the submitted fields',issues:(error as any).issues},400);console.error('Request failed',error instanceof Error?error.name:'unknown');return json({error:'The request could not be completed'},500);}
