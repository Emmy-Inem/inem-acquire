import dotenv from "dotenv";
import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import { createClient } from "@supabase/supabase-js";
import { catalogIndustries } from "../server/discovery-industries.js";
import { webUrl } from "../server/lead-discovery.js";

dotenv.config({ path: ".env.local", quiet: true });
const path = process.argv[2];
if (!path) throw new Error("Pass a prepared Overture website candidate CSV.");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const candidates = [];
for await (const row of createReadStream(path).pipe(parse({ columns: true, bom: true }))) {
  const website = webUrl(row.website);
  if (row.cohort !== "new" || !website || !row.id || !row.name || !row.release) continue;
  if (/^(?:www\.)?(?:facebook\.com|fb\.com|instagram\.com|linkedin\.com|linktr\.ee|bit\.ly|wa\.me|twitter\.com|x\.com|google\.com|maps\.app\.goo\.gl)$/.test(new URL(website).hostname)) continue;
  candidates.push({
    id: row.id, name: row.name, category: row.category || null, city: row.city || null,
    region: row.region || null, address: row.address || null, country: "NG", website,
    industries: catalogIndustries(row.category, row.category_group), source_release: row.release,
  });
}
for (let offset = 0; offset < candidates.length; offset += 250) {
  const { error } = await db.from("discovery_source_candidates").upsert(candidates.slice(offset, offset + 250));
  if (error) throw new Error("Source candidate import failed (" + error.code + ").");
}
console.log("Source candidates upserted:", candidates.length);
