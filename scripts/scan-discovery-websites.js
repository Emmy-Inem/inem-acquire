import { createReadStream, existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { parse } from "csv-parse";
import { scanBusinessWebsite } from "../server/business-website.js";
import { webUrl } from "../server/lead-discovery.js";

const [input, output, batchSize = "1000"] = process.argv.slice(2);
const limit = Number(batchSize);
if (!input || !output || !Number.isInteger(limit) || limit < 1 || limit > 5000)
  throw new Error("Usage: node scripts/scan-discovery-websites.js targets.csv results.jsonl [1–5000]");

const skippedHosts = [
  "facebook.com", "fb.com", "instagram.com", "x.com", "twitter.com", "tiktok.com",
  "wa.me", "whatsapp.com", "google.com", "maps.app.goo.gl", "linkedin.com",
  "foursquare.com", "businesslist.com.ng", "finelib.com", "ranked.ng",
  "linktr.ee", "bit.ly", "jumia.com.ng", "jiji.ng", "youtube.com", "youtu.be",
  "blogspot.com", "wordpress.com", "wixsite.com", "godaddysites.com",
  "github.io", "web.app", "vercel.app", "netlify.app", "sites.google.com",
];

function key(value) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\d]/gu, "");
}

function namesAgree(listed, published) {
  const legalSuffix = /\b(?:nigeria|limited|ltd|llc|plc|inc)\b/gi;
  const name = key(listed.replace(legalSuffix, ""));
  const evidence = key(published.replace(legalSuffix, ""));
  return name.length >= 5 && evidence.length >= 5 && (evidence.startsWith(name) || name.startsWith(evidence));
}

const completed = new Set(
  existsSync(output)
    ? (await readFile(output, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line).host)
    : [],
);

const byHost = new Map();
const conflicts = new Set();
for await (const row of createReadStream(input).pipe(parse({ columns: true, bom: true }))) {
  const website = webUrl(row.website);
  if (!website) continue;
  const host = new URL(website).hostname.replace(/^www\./, "");
  if (completed.has(host) || !host.includes(".") || skippedHosts.some((base) => host === base || host.endsWith("." + base))) continue;
  const prior = byHost.get(host);
  if (prior && key(prior.name) !== key(row.name)) conflicts.add(host);
  if (!prior || (row.cohort === "existing" && prior.cohort !== "existing"))
    byHost.set(host, { ...row, website, host });
}

const candidates = [...byHost.values()].filter((row) => !conflicts.has(row.host));
const fresh = candidates.filter((row) => row.cohort === "new");
const known = candidates.filter((row) => row.cohort === "existing");
const first = fresh.slice(0, Math.ceil(limit / 3));
const existing = known.slice(0, limit - first.length);
const targets = [...first, ...existing, ...fresh.slice(first.length, limit - existing.length)];
let cursor = 0, done = 0, matched = 0;
let writes = Promise.resolve();

async function scan(row) {
  try {
    const pages = await scanBusinessWebsite(row.website, { country: "NG" });
    const publishedNames = pages.map((page) => page.details?.name).filter(Boolean);
    const agreed = publishedNames.some((name) => namesAgree(row.name, name));
    if ((publishedNames.length && !agreed) || (row.cohort === "new" && !agreed))
      return { host: row.host, status: "identity-unconfirmed" };
    const emailPage = !row.email && pages.find((page) =>
      page.emails.some((email) => email.endsWith("@" + row.host)));
    const email = emailPage ? emailPage.emails.find((value) => value.endsWith("@" + row.host)) : null;
    const phonePage = !row.phone && (agreed || !!email || row.email?.endsWith("@" + row.host)) &&
      pages.find((page) => page.phones.some((phone) => /^\+234\d{10}$/.test(phone)));
    const phone = phonePage ? phonePage.phones.find((value) => /^\+234\d{10}$/.test(value)) : null;
    if (!email && !phone) return { host: row.host, status: "no-new-contact" };
    return {
      host: row.host, status: "found", row, email, phone,
      emailEvidence: emailPage?.source || null,
      phoneEvidence: phonePage?.source || null,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return { host: row.host, status: "unavailable" };
  }
}

console.log("Eligible sites", candidates.length, "checking", targets.length);
async function appendCheckpoint(line) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await appendFile(output, line);
      return;
    } catch (error) {
      if (attempt >= 5 || !["EBUSY", "EPERM"].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (2 ** attempt)));
    }
  }
}

async function worker() {
  while (cursor < targets.length) {
    const row = targets[cursor++];
    const result = await scan(row);
    const line = JSON.stringify(result) + "\n";
    writes = writes.then(() => appendCheckpoint(line));
    await writes;
    if (result.status === "found") matched += 1;
    done += 1;
    if (done % 100 === 0) console.log("Checked", done, "with contact evidence", matched);
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
console.log("Checked", done, "with contact evidence", matched);
