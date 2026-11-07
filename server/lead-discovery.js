import { industries } from "../shared/research.js";
import { askGemini } from "./gemini.js";

export function webUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function businessEmail(value) {
  const email = value?.trim().toLowerCase();
  return /^(?:info|hello|contact|enquiries|inquiries|sales|office|admin|support|reception|booking|bookings|reservations|business|partnerships|team|care|customerservice|customersupport)(?:[._-][a-z]+)?@[a-z0-9.-]+\.[a-z]{2,}$/i.test(
    email || "",
  )
    ? email
    : null;
}

const cache = new Map();
const inFlight = new Map();

export async function findBusinesses(env, { city, country, industry }) {
  const key = `${city.toLowerCase()}:${country}:${industry}`;
  const cached = cache.get(key);
  if (cached?.expires > Date.now()) return cached.value;
  if (inFlight.has(key)) return inFlight.get(key);
  const lookup = search(env, city, country, industry);
  inFlight.set(key, lookup);
  try {
    const value = await lookup;
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expires: Date.now() + 30 * 60 * 1000 });
    return value;
  } finally {
    inFlight.delete(key);
  }
}

async function search(env, city, country, industry) {
  const { label, tags } = industries[industry];
  const cityPattern = "^" + city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
  const clauses = Object.entries(tags)
    .map(
      ([tag, values]) =>
        `nwr(area.place)(area.country)["${tag}"~"^(${values.join("|")})$"]["name"]; `,
    )
    .join("");
  const data = `[out:json][timeout:9];area["ISO3166-1"=${JSON.stringify(country)}]["admin_level"="2"]->.country;area["name"~${JSON.stringify(cityPattern)},i]["boundary"="administrative"]->.place;(${clauses});out tags 45;`;
  let records;
  try {
    const endpoint = new URL(
      env.OVERPASS_URL || "https://overpass.private.coffee/api/interpreter",
    );
    endpoint.searchParams.set("data", data);
    const response = await fetch(endpoint, {
      headers: {
        "User-Agent":
          "InemAcquireResearch/1.0 (+https://inem-acquire.vercel.app)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(13500),
    });
    if (!response.ok) throw new Error();
    const payload = await response.json();
    if (
      payload.remark?.includes("runtime error") ||
      !Array.isArray(payload.elements)
    )
      throw new Error();
    records = payload.elements;
  } catch {
    throw Object.assign(
      new Error(
        "The public directory is busy. Try again shortly or check a company website below.",
      ),
      { status: 503 },
    );
  }
  const allowedTags = new Set(Object.values(tags).flat());
  const companies = [],
    seen = new Set();
  for (const element of records) {
    const fields = element.tags || {};
    if (
      !["node", "way", "relation"].includes(element.type) ||
      !Number.isSafeInteger(element.id)
    )
      continue;
    const name = fields.name?.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const source_url = `https://www.openstreetmap.org/${element.type}/${element.id}`;
    const category = Object.keys(tags)
      .map((tag) => fields[tag])
      .find((value) => allowedTags.has(value));
    companies.push({
      name: name.slice(0, 200),
      website: webUrl(fields["contact:website"] || fields.website),
      industry: category?.replaceAll("_", " ") || label,
      country,
      source_url,
      email:
        (fields["contact:email"] || fields.email || "")
          .split(";")
          .map(businessEmail)
          .find(Boolean) || null,
      phone:
        [fields["contact:phone"], fields.phone].find((value) =>
          /^\+?[\d(). -]{7,24}$/.test(value || ""),
        ) || null,
    });
  }
  const categories = [...new Set(companies.map((row) => row.industry))];
  const ranked =
    categories.length > 1 &&
    (await askGemini(
      env,
      "Order the supplied public business categories by how directly they match the industry. Return only categories from the list.",
      { industry: label, categories },
      {
        type: "object",
        properties: {
          categories: { type: "array", items: { type: "string" } },
        },
        required: ["categories"],
      },
    ));
  const order = Array.isArray(ranked?.categories)
    ? [...new Set(ranked.categories.filter((x) => categories.includes(x)))]
    : [];
  const rank = (row) =>
    order.includes(row.industry) ? order.indexOf(row.industry) : order.length;
  companies.sort(
    (a, b) => rank(a) - rank(b) || Number(!!b.website) - Number(!!a.website),
  );
  return { companies: companies.slice(0, 20), ranked: order.length > 0 };
}
