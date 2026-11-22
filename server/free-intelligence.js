import { webUrl } from "./lead-discovery.js";

const agent = "InemAcquireResearch/1.0 (+https://inem-acquire.vercel.app)";

const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "trashmail.com",
  "yopmail.com",
  "sharklasers.com",
  "getnada.com",
  "maildrop.cc",
  "dispostable.com",
  "fakeinbox.com",
  "throwawaymail.com",
]);

const mxCache = new Map();
const rdapCache = new Map();
const waybackCache = new Map();
const gleifCache = new Map();
const holidayCache = new Map();
let fxCache = null;

function cleanDomain(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return null;
  try {
    const host = raw.includes("://")
      ? new URL(raw).hostname
      : raw.includes("@")
        ? raw.split("@").pop()
        : raw.split("/")[0];
    const domain = host.replace(/^www\./, "").replace(/\.$/, "");
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
      domain,
    )
      ? domain
      : null;
  } catch {
    return null;
  }
}

/**
 * 1. Cloudflare DNS-over-HTTPS (DoH) API (Free, No Key Required)
 * Checks MX and A records for a domain to confirm email deliverability.
 */
export async function checkDomainDns(domainInput, { signal } = {}) {
  const domain = cleanDomain(domainInput);
  if (!domain) return { domain: null, valid: false, hasMx: false, disposable: false };
  const disposable = DISPOSABLE_DOMAINS.has(domain);
  const cached = mxCache.get(domain);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const endpoint = new URL("https://cloudflare-dns.com/dns-query");
    endpoint.searchParams.set("name", domain);
    endpoint.searchParams.set("type", "MX");
    const response = await fetch(endpoint, {
      headers: { Accept: "application/dns-json", "User-Agent": agent },
      signal: signal || AbortSignal.timeout(4500),
    });
    if (!response.ok) throw new Error("DoH query failed");
    const payload = await response.json();
    const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
    const mxRecords = answers
      .filter((a) => a.type === 15 && typeof a.data === "string")
      .map((a) => a.data.trim().replace(/\.$/, ""))
      .filter(Boolean);
    const hasMx = mxRecords.length > 0 && !mxRecords.some((r) => /^0\s+\.?$/.test(r));
    const value = {
      domain,
      valid: payload.Status === 0,
      hasMx,
      mxRecords: mxRecords.slice(0, 5),
      disposable,
      deliverable: payload.Status === 0 && hasMx && !disposable,
      provider: "Cloudflare DoH",
    };
    if (mxCache.size >= 300) mxCache.delete(mxCache.keys().next().value);
    mxCache.set(domain, { value, expires: Date.now() + 30 * 60_000 });
    return value;
  } catch {
    return {
      domain,
      valid: null,
      hasMx: null,
      mxRecords: [],
      disposable,
      deliverable: !disposable ? null : false,
      provider: "Cloudflare DoH",
    };
  }
}

/**
 * 2. RDAP Domain Registration Intelligence (Free IETF Standard, No Key Required)
 * Retrieves domain registration date, expiration, and status from rdap.org.
 */
export async function lookupDomainRdap(domainInput, { signal } = {}) {
  const domain = cleanDomain(domainInput);
  if (!domain) return null;
  const cached = rdapCache.get(domain);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const response = await fetch(
      `https://rdap.org/domain/${encodeURIComponent(domain)}`,
      {
        headers: { Accept: "application/rdap+json, application/json", "User-Agent": agent },
        signal: signal || AbortSignal.timeout(5500),
      },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const registeredAt =
      events.find((e) => e.eventAction === "registration")?.eventDate || null;
    const expiresAt =
      events.find((e) => e.eventAction === "expiration")?.eventDate || null;
    const statuses = Array.isArray(data.status) ? data.status.slice(0, 6) : [];
    const value = {
      domain,
      handle: typeof data.ldhName === "string" ? data.ldhName.toLowerCase() : domain,
      registeredAt,
      expiresAt,
      statuses,
      active: !statuses.some((s) => /hold|expired|pendingDelete|redemption/i.test(s)),
      provider: "RDAP",
    };
    if (rdapCache.size >= 200) rdapCache.delete(rdapCache.keys().next().value);
    rdapCache.set(domain, { value, expires: Date.now() + 60 * 60_000 });
    return value;
  } catch {
    return null;
  }
}

/**
 * 3. Internet Archive Wayback Machine Availability API (Free, No Key Required)
 * Finds the most recent archived snapshot when a prospect website is unreachable.
 */
export async function findWaybackSnapshot(urlInput, { signal } = {}) {
  const target = webUrl(urlInput) || (cleanDomain(urlInput) ? `https://${cleanDomain(urlInput)}` : null);
  if (!target) return null;
  const cached = waybackCache.get(target);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const endpoint = new URL("https://archive.org/wayback/available");
    endpoint.searchParams.set("url", target);
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json", "User-Agent": agent },
      signal: signal || AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const closest = data?.archived_snapshots?.closest;
    if (!closest?.available || !closest?.url) return null;
    const snapshotUrl = webUrl(closest.url.replace(/^http:\/\//i, "https://"));
    if (!snapshotUrl) return null;
    const value = {
      available: true,
      url: snapshotUrl,
      timestamp: String(closest.timestamp || ""),
      status: String(closest.status || "200"),
      provider: "Internet Archive Wayback Machine",
    };
    if (waybackCache.size >= 200) waybackCache.delete(waybackCache.keys().next().value);
    waybackCache.set(target, { value, expires: Date.now() + 60 * 60_000 });
    return value;
  } catch {
    return null;
  }
}

/**
 * 4. GLEIF Legal Entity Identifier API (Free, No Key Required)
 * Searches official corporate legal entity records globally and by country.
 */
export async function findGleifEntities({ keyword, city, country }, { signal } = {}) {
  const search = String(keyword || "").trim();
  if (search.length < 2) return [];
  const key = `${search.toLowerCase()}:${(city || "").toLowerCase()}:${country || ""}`;
  const cached = gleifCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const endpoint = new URL("https://api.gleif.org/api/v1/lei-records");
    endpoint.searchParams.set("filter[entity.legalName]", search);
    if (country && /^[A-Z]{2}$/.test(country)) {
      endpoint.searchParams.set("filter[entity.legalAddress.country]", country);
    }
    endpoint.searchParams.set("page[size]", "15");
    const response = await fetch(endpoint, {
      headers: { Accept: "application/vnd.api+json", "User-Agent": agent },
      signal: signal || AbortSignal.timeout(6500),
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const cityFilter = String(city || "").trim().toLowerCase();
    const companies = [];
    for (const item of rows) {
      const entity = item?.attributes?.entity;
      const lei = item?.attributes?.lei || item?.id;
      const name = entity?.legalName?.name?.trim();
      if (!name || !lei) continue;
      const legalCity = entity?.legalAddress?.city?.trim() || "";
      const hqCity = entity?.headquartersAddress?.city?.trim() || "";
      const recordCity = hqCity || legalCity;
      if (
        cityFilter &&
        recordCity &&
        !recordCity.toLowerCase().includes(cityFilter) &&
        !cityFilter.includes(recordCity.toLowerCase())
      ) {
        continue;
      }
      const addressParts = [
        ...(entity?.headquartersAddress?.addressLines || entity?.legalAddress?.addressLines || []),
        recordCity,
        entity?.headquartersAddress?.region || entity?.legalAddress?.region,
        entity?.headquartersAddress?.country || entity?.legalAddress?.country || country,
      ]
        .map((p) => String(p || "").trim())
        .filter(Boolean);
      companies.push({
        name: name.slice(0, 200),
        website: null,
        industry: entity?.category ? String(entity.category).replaceAll("_", " ").toLowerCase() : "Registered Legal Entity",
        city: recordCity || city || null,
        address: addressParts.join(", ").slice(0, 300) || null,
        country: entity?.legalAddress?.country || country,
        source_url: `https://search.gleif.org/#/record/${encodeURIComponent(lei)}`,
        directory: "GLEIF",
        email: null,
        phone: null,
      });
    }
    if (gleifCache.size >= 100) gleifCache.delete(gleifCache.keys().next().value);
    gleifCache.set(key, { value: companies, expires: Date.now() + 30 * 60_000 });
    return companies;
  } catch {
    return [];
  }
}

/**
 * 5. Open Exchange Rates & Frankfurter API (Free, No Key Required)
 * Returns live multi-currency exchange rates (including NGN, USD, EUR, GBP, KES, ZAR, GHS).
 */
export async function getExchangeRates(base = "NGN", { signal } = {}) {
  const cleanBase = /^[A-Z]{3}$/.test(base) ? base : "NGN";
  if (fxCache && fxCache.base === cleanBase && fxCache.expires > Date.now()) {
    return fxCache.value;
  }

  try {
    const response = await fetch(
      `https://open.er-api.com/v6/latest/${encodeURIComponent(cleanBase)}`,
      {
        headers: { Accept: "application/json", "User-Agent": agent },
        signal: signal || AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) throw new Error("Primary FX provider unavailable");
    const data = await response.json();
    if (!data?.rates || typeof data.rates !== "object") throw new Error("Invalid FX payload");
    const value = {
      base: cleanBase,
      updatedAt: data.time_last_update_utc || new Date().toISOString(),
      rates: {
        NGN: data.rates.NGN ?? 1,
        USD: data.rates.USD ?? null,
        EUR: data.rates.EUR ?? null,
        GBP: data.rates.GBP ?? null,
        CAD: data.rates.CAD ?? null,
        GHS: data.rates.GHS ?? null,
        KES: data.rates.KES ?? null,
        ZAR: data.rates.ZAR ?? null,
      },
      provider: "Open Exchange Rates",
    };
    fxCache = { base: cleanBase, value, expires: Date.now() + 6 * 60 * 60_000 };
    return value;
  } catch {
    try {
      const fallback = await fetch(
        `https://api.frankfurter.dev/v1/latest?base=USD`,
        {
          headers: { Accept: "application/json", "User-Agent": agent },
          signal: signal || AbortSignal.timeout(4500),
        },
      );
      if (fallback.ok) {
        const data = await fallback.json();
        return {
          base: "USD",
          updatedAt: data.date || new Date().toISOString(),
          rates: { USD: 1, ...data.rates },
          provider: "Frankfurter ECB",
        };
      }
    } catch {
      /* Fallback gracefully when offline */
    }
    return {
      base: cleanBase,
      updatedAt: null,
      rates: { NGN: 1 },
      provider: "offline",
    };
  }
}

/**
 * 6. Nager.Date Public Holidays API (Free, No Key Required)
 * Retrieves upcoming public holidays for Nigeria (NG) or any prospect country to aid outreach scheduling.
 */
export async function getUpcomingHolidays(countryCode = "NG", { signal } = {}) {
  const country = /^[A-Z]{2}$/.test(String(countryCode || "").toUpperCase())
    ? String(countryCode).toUpperCase()
    : "NG";
  const year = new Date().getUTCFullYear();
  const key = `${country}:${year}`;
  const cached = holidayCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const response = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(country)}`,
      {
        headers: { Accept: "application/json", "User-Agent": agent },
        signal: signal || AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return [];
    const list = await response.json();
    if (!Array.isArray(list)) return [];
    const today = new Date().toISOString().slice(0, 10);
    const holidays = list
      .filter((h) => typeof h?.date === "string" && h.date >= today)
      .slice(0, 6)
      .map((h) => ({
        date: h.date,
        name: String(h.name || h.localName || "Public holiday").slice(0, 120),
        localName: String(h.localName || h.name || "").slice(0, 120),
        countryCode: country,
      }));
    if (holidayCache.size >= 50) holidayCache.delete(holidayCache.keys().next().value);
    holidayCache.set(key, { value: holidays, expires: Date.now() + 12 * 60 * 60_000 });
    return holidays;
  } catch {
    return [];
  }
}
