import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse";
import { createReadStream } from "node:fs";
import { webUrl } from "../server/lead-discovery.js";
import { catalogIndustries } from "../server/discovery-industries.js";

dotenv.config({ path: ".env.local", quiet: true });
const paths = process.argv.slice(2);
if (paths.length !== 2)
  throw new Error("Provide the business-candidate and needs-review CSV paths.");

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function text(value) {
  return value?.replace(/^'(?=\s*[-=+@]|[\t\r\n])/, "").trim() || null;
}

function listing(row, needsReview) {
  const category = text(row.category),
    categoryGroup = text(row.category_group);
  const item = {
    overture_place_id: text(row.overture_place_id),
    name: text(row.business_name),
    category,
    category_group: categoryGroup,
    industries: catalogIndustries(category, categoryGroup),
    phone: text(row.phone_e164),
    email: text(row.email),
    website: webUrl(row.website),
    city: text(row.city),
    region: text(row.state_or_region),
    address: text(row.street_address),
    country: text(row.country_code),
    operating_status: text(row.operating_status),
    source_release: text(row.overture_release),
    upstream_sources: text(row.upstream_sources),
    source_licenses: text(row.source_licenses),
    needs_review: needsReview,
  };
  if (
    !item.overture_place_id || !item.name || item.country !== "NG" ||
    (!item.phone && !item.email) || !item.source_release ||
    !item.upstream_sources || !item.source_licenses ||
    row.classification !== (needsReview ? "needs review" : "business category")
  ) throw new Error("Unexpected catalog record or input file order.");
  return item;
}

async function upsert(rows) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error, status } = await db.from("discovery_catalog").upsert(rows);
    if (!error) return;
    if (attempt === 3 || (status >= 400 && status < 500 && status !== 429))
      throw new Error("Catalog batch rejected (" + (error.code || status) + ").");
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}

for (const [index, path] of paths.entries()) {
  const input = createReadStream(path).pipe(parse({ columns: true, bom: true }));
  let rows = [], imported = 0;
  for await (const row of input) {
    rows.push(listing(row, index === 1));
    if (rows.length === 750) {
      await upsert(rows);
      imported += rows.length;
      rows = [];
      if (imported % 7500 === 0) console.log(path, imported);
    }
  }
  if (rows.length) await upsert(rows);
  console.log(path, imported + rows.length, "upserted");
}
