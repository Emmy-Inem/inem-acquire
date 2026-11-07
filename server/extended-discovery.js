import { groundedBusinessSearch } from "./grounded-search.js";
import { industries } from "../shared/research.js";
import { askGemini } from "./gemini.js";
import { findMappedBusinesses, webUrl } from "./lead-discovery.js";
import { findWikidataBusinesses } from "./wikidata-directory.js";

const termPattern = /^[\p{L}\p{M}\d][\p{L}\p{M}\d -]{1,39}$/u;
const words = (text) =>
  (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\d]+/gu, " ")
    .trim();
const identity = (text) => words(text).replaceAll(" ", "");
const cache = new Map();
const inFlight = new Map();

export async function findOutsideCatalog(env, db, query) {
  const key = JSON.stringify(query);
  const recent = cache.get(key);
  if (recent?.expires > Date.now()) return recent.result;
  if (inFlight.has(key)) return inFlight.get(key);
  const work = search(env, db, query);
  inFlight.set(key, work);
  try {
    const result = await work;
    if (cache.size >= 80) cache.delete(cache.keys().next().value);
    cache.set(key, { result, expires: Date.now() + 5 * 60_000 });
    return result;
  } finally {
    inFlight.delete(key);
  }
}

async function search(env, db, { city, country, industry, keyword }) {
  const plan = await askGemini(
    env,
    "Plan a search of a public business map. Return up to two short equivalent business terms and one closest preset industry key if relevant. Choose short searchable aliases such as bakery or bakeries, rather than sentences. Use empty fields for irrelevant input. Do not name companies or invent contact details.",
    {
      keyword: keyword || industries[industry]?.label,
      industries: Object.entries(industries).map(([id, item]) => ({
        id,
        label: item.label,
      })),
    },
    {
      type: "object",
      properties: {
        terms: { type: "array", items: { type: "string" }, maxItems: 2 },
        industry: { type: "string", enum: ["", ...Object.keys(industries)] },
      },
      required: ["terms", "industry"],
    },
  );
  const original = words(keyword).slice(0, 70);
  const aliases = Array.isArray(plan?.terms)
    ? plan.terms
        .filter(
          (term) => typeof term === "string" && termPattern.test(term.trim()),
        )
        .slice(0, 2)
        .map(words)
    : [];
  const terms = [...new Set([original, ...aliases].filter(Boolean))];
  const plannedIndustry = Object.hasOwn(industries, plan?.industry)
    ? plan.industry
    : null;
  const sector = industry === "all" ? plannedIndustry : industry;
  const sources = await Promise.allSettled([
    findMappedBusinesses(env, city, country, sector, terms),
    findWikidataBusinesses({ city, country, industry: sector }, webUrl),
    groundedBusinessSearch(
      env,
      { city, country, industry: sector, keyword },
      { limit: 50 },
    ).then((result) => {
      if (!result.available) throw new Error("Web search unavailable");
      return result.candidates;
    }),
  ]);
  const live = sources
    .flatMap((source) => (source.status === "fulfilled" ? source.value : []))
    .filter(
      (row) =>
        !original ||
        terms.some((term) =>
          words(row.name + " " + (row.industry || "")).includes(term),
        ),
    );
  let companies = await removeCatalogMatches(db, country, live);
  const partial = sources.some((source) => source.status === "rejected");
  let snapshot = false;
  if (companies.length < 50 && country === "NG") {
    try {
      const candidates = await sourceSnapshot(db, {
        city,
        country,
        sector,
        terms: original ? terms : [],
      });
      companies = await removeCatalogMatches(db, country, [
        ...companies,
        ...candidates,
      ]);
      snapshot = true;
    } catch (error) {
      if (sources.every((source) => source.status === "rejected")) throw error;
    }
  }
  if (
    !companies.length &&
    !snapshot &&
    sources.every((source) => source.status === "rejected")
  )
    throw Object.assign(
      new Error(
        "The live business directories are unavailable. Try again shortly.",
      ),
      { status: 503 },
    );

  return {
    companies: companies
      .slice(0, 50)
      .map((row) => ({ ...row, city: row.city || city })),
    geminiUsed: !!(aliases.length || plannedIndustry),
    partial,
    snapshot,
    target: 50,
    availability:
      companies.length < 50
        ? "Fewer than 50 additional businesses matched the available public sources. Try a broader area or industry."
        : null,
  };
}

async function removeCatalogMatches(db, country, rows) {
  const seen = new Set();
  const candidates = rows
    .filter((row) => {
      const name = identity(row.name);
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .slice(0, 250);
  if (!candidates.length) return [];
  const { data, error } = await db.rpc("existing_discovery_matches", {
    candidate_rows: candidates,
    country_code: country,
  });
  if (error)
    throw Object.assign(
      new Error(
        "The catalog could not be checked for duplicates. Try again shortly.",
      ),
      { status: 503 },
    );
  const matched = new Set(data);
  return candidates.filter((_row, index) => !matched.has(index));
}

async function sourceSnapshot(db, { city, country, sector, terms }) {
  let query = db
    .from("discovery_source_candidates")
    .select(
      "id,name,category,city,region,address,country,website,source_release",
    )
    .eq("country", country)
    .textSearch("location_search", city, { type: "plain", config: "simple" })
    .order("name")
    .order("id")
    .limit(200);
  if (terms.length)
    query = query.textSearch(
      "business_search",
      terms.map((term) => '"' + term + '"').join(" OR "),
      { type: "websearch", config: "simple" },
    );
  else if (sector) query = query.contains("industries", [sector]);
  const { data, error } = await query;
  if (error)
    throw Object.assign(
      new Error("Additional public business records are unavailable."),
      { status: 503 },
    );
  return data.map(({ category, source_release, ...row }) => ({
    ...row,
    website: webUrl(row.website),
    industry: category?.replaceAll("_", " ") || null,
    source_url: "https://explore.overturemaps.org/",
    directory: "Overture",
    release: source_release,
  }));
}
