import { webUrl } from "./lead-discovery.js";

const pageSize = 20;

export async function searchCatalog(db, { city, country, industry, keyword, page }) {
  const offset = (page - 1) * pageSize;
  let search = db
    .from("discovery_catalog")
    .select("overture_place_id,name,category,phone,email,website,city,region,address,country,needs_review,source_release")
    .eq("country", country)
    .order("needs_review")
    .order("name")
    .order("overture_place_id")
    .range(offset, offset + pageSize);
  if (city) search = search.textSearch("location_search", city, { config: "simple", type: "plain" });
  if (keyword) search = search.textSearch("business_search", keyword, { config: "simple", type: "plain" });
  if (industry !== "all") search = search.contains("industries", [industry]);
  const { data, error } = await search;
  if (error) throw Object.assign(new Error("The business catalog is temporarily unavailable."), { status: 503 });
  return {
    companies: data.slice(0, pageSize).map((row) => ({
      id: row.overture_place_id,
      name: row.name,
      industry: row.category?.replaceAll("_", " ") || null,
      phone: /^\+234\d{10}$/.test(row.phone || "") ? row.phone : null,
      email: /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(row.email || "") ? row.email : null,
      website: webUrl(row.website),
      city: row.city,
      region: row.region,
      address: row.address,
      country: row.country,
      needsReview: row.needs_review,
      release: row.source_release,
      source_url: "https://explore.overturemaps.org/",
      directory: "Overture",
    })),
    hasMore: data.length > pageSize && page < 250,
  };
}
