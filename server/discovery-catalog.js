import { webUrl } from "./lead-discovery.js";

export async function searchCatalog(db, { city, country, industry, keyword, page, pageSize = 20, contact = "any" }) {
  const offset = (page - 1) * pageSize;
  let search = db
    .from("discovery_catalog")
    .select("overture_place_id,name,category,phone,email,website,city,region,address,country,needs_review,source_release,listing_source,email_evidence_url,phone_evidence_url,contact_checked_at,website_status,website_checked_at")
    .eq("country", country)
    .order("needs_review")
    .order("name")
    .order("overture_place_id")
    .range(offset, offset + pageSize);
  if (city) search = search.textSearch("location_search", city, { config: "simple", type: "plain" });
  if (keyword) search = search.textSearch("business_search", keyword, { config: "simple", type: "plain" });
  if (industry !== "all") search = search.contains("industries", [industry]);
  if (contact === "email" || contact === "both") search = search.not("email", "is", null);
  if (contact === "phone" || contact === "both") search = search.not("phone", "is", null);
  const { data, error, status } = await search;
  if (status === 416) return { companies: [], hasMore: false };
  if (error) throw Object.assign(new Error("The business catalog is temporarily unavailable."), { status: 503 });
  return {
    companies: data.slice(0, pageSize).map((row) => ({
      id: row.overture_place_id,
      name: row.name,
      industry: row.category?.replaceAll("_", " ") || null,
      phone: /^\+234\d{10}$/.test(row.phone || "") ? row.phone : null,
      email: /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(row.email || "") ? row.email : null,
      website: row.website_status === "verified" && Date.parse(row.website_checked_at) > Date.now() - 30 * 86400000
        ? webUrl(row.website) : null,
      hasWebsite: !!webUrl(row.website),
      websiteHost: webUrl(row.website) ? new URL(webUrl(row.website)).hostname.replace(/^www\./, "") : null,
      websiteStatus: row.website_status === "verified" && !(Date.parse(row.website_checked_at) > Date.now() - 30 * 86400000)
        ? "unreviewed" : row.website_status,
      city: row.city,
      region: row.region,
      address: row.address,
      country: row.country,
      needsReview: row.needs_review,
      release: row.source_release,
      source_url: row.listing_source === "Foursquare"
        ? "https://docs.foursquare.com/data-products/docs/fsq-places-open-source"
        : "https://explore.overturemaps.org/",
      directory: row.listing_source,
      catalog: true,
      emailEvidence: webUrl(row.email_evidence_url),
      phoneEvidence: webUrl(row.phone_evidence_url),
      contactCheckedAt: row.contact_checked_at,
    })),
    hasMore: data.length > pageSize,
  };
}
