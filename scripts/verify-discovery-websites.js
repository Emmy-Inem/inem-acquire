import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { scanBusinessWebsite } from "../server/business-website.js";

dotenv.config({path:".env.local",quiet:true});
const limit=Number(process.argv[2] || 600);
if(!Number.isInteger(limit)||limit<1||limit>5000)throw new Error("Choose 1–5000 listings.");
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
let records=[],offset=0;
const hosts=new Set();
while(records.length<limit){
 const {data,error}=await db.from("discovery_catalog")
  .select("overture_place_id,name,website").not("website","is",null)
  .eq("website_status","unreviewed")
  .order("name").order("overture_place_id").range(offset,offset+499);
 if(error)throw new Error("Cannot load website review batch.");
 if(!data.length)break;
 for(const row of data){
  let url;try{url=new URL(row.website);}catch{continue;}
  const key=url.hostname.replace(/^www\./,"");
  if(hosts.has(key))continue;
  hosts.add(key);records.push(row);
  if(records.length===limit)break;
 }
 offset+=data.length;
 if(data.length<500)break;
}
let cursor=0,done=0;
const counts={verified:0,needs_review:0,unavailable:0};
async function worker(){
 while(cursor<records.length){
  const row=records[cursor++];
  let status="verified";
  try{await scanBusinessWebsite(row.website,{country:"NG",expectedName:row.name});}
  catch(e){status=e.message==="This website is unavailable or parked."?"unavailable":"needs_review";}
  const {error}=await db.from("discovery_catalog")
   .update({website_status:status,website_checked_at:new Date().toISOString()})
   .eq("overture_place_id",row.overture_place_id).eq("website",row.website);
  if(error)throw new Error("Cannot save website review.");
  counts[status]+=1;done+=1;
  if(done%100===0)console.log("Checked",done,counts);
 }
}
await Promise.all(Array.from({length:16},worker));
console.log("Website review completed",JSON.stringify({checked:done,...counts}));
