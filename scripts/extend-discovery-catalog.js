import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse";
import { businessEmail, webUrl } from "../server/lead-discovery.js";
import { catalogIndustries } from "../server/discovery-industries.js";

dotenv.config({ path: ".env.local", quiet: true });
const [businesses, review, foursquare, evidence, batch = "all"] = process.argv.slice(2);
if (!businesses || !review || !foursquare || !evidence || !["all", "snapshot", "websites"].includes(batch))
  throw new Error("Usage: node scripts/extend-discovery-catalog.js business.csv review.csv foursquare.csv evidence.jsonl [all|snapshot|websites]");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const csv = (path) => createReadStream(path).pipe(parse({ columns: true, bom: true }));
const text = (value) => value?.trim() || null;
const phone = (value) => /^\+234\d{10}$/.test(value || "") ? value : null;
const email = (value) => /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(value || "") ? value.toLowerCase() : null;
const nameKey = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const host = (value) => {
  const url = webUrl(value);
  return url && new URL(url).hostname.replace(/^www\./, "");
};
const keySets = { names: new Set(), emails: new Set(), phones: new Set() };

function addKeys(name, inbox, number) {
  if (name) keySets.names.add(nameKey(name));
  if (inbox) keySets.emails.add(inbox.toLowerCase());
  if (number) keySets.phones.add(number);
}
for (const path of [businesses, review])
  for await (const row of csv(path)) addKeys(row.business_name, row.email, row.phone_e164);

function overlaps(name, inbox, number) {
  return keySets.names.has(nameKey(name)) || (inbox && keySets.emails.has(inbox)) || (number && keySets.phones.has(number));
}

function requireSuccess(response) {
  if (response.error) throw new Error("Catalog write failed (" + (response.error.code || response.status) + ").");
  return response.data;
}

async function addRows(rows) {
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += 250) {
    inserted += requireSuccess(await db.from("discovery_catalog")
      .upsert(rows.slice(offset, offset + 250), { ignoreDuplicates: true }).select("overture_place_id")).length;
  }
  return inserted;
}

const fsqRows = [];
for await (const row of csv(foursquare)) {
  const name = text(row.name), inbox = email(row.email), number = phone(row.phone);
  if (!name || !/^[a-f0-9]{24}$/i.test(row.fsq_place_id) || (!inbox && !number) || overlaps(name, inbox, number))
    continue;
  const category = text(row.category);
  fsqRows.push({
    overture_place_id: "fsq:" + row.fsq_place_id,
    listing_source: "Foursquare",
    source_release: "2025-02-06",
    upstream_sources: "Foursquare Open Source Places; Source Cooperative",
    source_licenses: "Apache-2.0",
    name, category, category_group: category?.split(" > ")[0],
    industries: catalogIndustries(category),
    phone: number, email: inbox, website: webUrl(row.website),
    city: text(row.city), region: text(row.region), address: text(row.address),
    country: "NG", needs_review: false,
  });
  addKeys(name, inbox, number);
}
if (batch !== "websites") console.log("Foursquare listings added", await addRows(fsqRows));
if (batch === "snapshot") process.exit(0);

const entries = (await readFile(evidence, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const added = [], updates = [], changed = new Set();
let emailsAdded = 0, phonesAdded = 0;
for (const item of entries) {
  if (item.status !== "found") continue;
  const { row } = item;
  const website = webUrl(row.website), domain = host(website);
  if (!domain || domain !== item.host || !Number.isFinite(Date.parse(item.checkedAt))) continue;
  const inbox = businessEmail(item.email);
  const number = phone(item.phone);
  const address = inbox?.endsWith("@" + domain) && host(item.emailEvidence) === domain && !keySets.emails.has(inbox) ? inbox : null;
  const telephone = number && host(item.phoneEvidence) === domain && !keySets.phones.has(number) ? number : null;
  if (!address && !telephone) continue;
  if (row.cohort === "new") {
    if (overlaps(row.name, address, telephone)) continue;
    added.push({
      overture_place_id: row.id, listing_source: "Overture",
      name: row.name, category: text(row.category), category_group: text(row.category_group),
      industries: catalogIndustries(row.category, row.category_group),
      country: "NG", website, city: text(row.city), region: text(row.region), address: text(row.address),
      needs_review: false, source_release: row.release,
      upstream_sources: row.upstream_sources, source_licenses: row.source_licenses,
      email: address, phone: telephone, contact_checked_at: item.checkedAt,
      email_evidence_url: address ? webUrl(item.emailEvidence) : null,
      phone_evidence_url: telephone ? webUrl(item.phoneEvidence) : null,
    });
    addKeys(row.name, address, telephone);
    continue;
  }
  for (const [field, value, source] of [["email", address, item.emailEvidence], ["phone", telephone, item.phoneEvidence]]) {
    if (!value) continue;
    updates.push({ id: row.id, website, field, value, source, checkedAt: item.checkedAt });
    if (field === "email") keySets.emails.add(value);
    else keySets.phones.add(value);
  }
}
for (let offset = 0; offset < updates.length; offset += 8) {
  await Promise.all(updates.slice(offset, offset + 8).map(async ({ id, website, field, value, source, checkedAt }) => {
    const rows = requireSuccess(await db.from("discovery_catalog")
      .update({ [field]: value, [field + "_evidence_url"]: webUrl(source), contact_checked_at: checkedAt })
      .eq("overture_place_id", id).eq("website", website).is(field, null).select("overture_place_id"));
    if (!rows.length) return;
    changed.add(id);
    if (field === "email") emailsAdded += 1;
    else phonesAdded += 1;
  }));
}
console.log("Website evidence", JSON.stringify({
  checkedSites: entries.length,
  newListings: await addRows(added),
  listingsEnriched: changed.size,
  emailsAdded,
  phonesAdded,
}));
