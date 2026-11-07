import { load } from "cheerio";

const generic = new Set([
  "limited", "ltd", "nigeria", "plc", "llc", "company", "services", "service",
  "group", "global", "enterprise", "enterprises", "ventures", "international",
  "solutions", "business", "the", "and", "inc", "com", "www",
]);

export function websiteIdentity(html, name) {
  const $ = load(html);
  const pageTitle = $("title").first().text().trim();
  const headings = [
    pageTitle,
    $('meta[property="og:site_name"]').attr("content"),
    $("h1").first().text(),
  ].filter(Boolean);
  for (const element of $('script[type="application/ld+json"]').toArray().slice(0, 20)) {
    try {
      const json = JSON.parse($(element).text());
      const roots = Array.isArray(json) ? json : [json];
      for (const item of roots.flatMap((root) => [root, ...(Array.isArray(root?.["@graph"]) ? root["@graph"] : [])])) {
        const kinds = Array.isArray(item?.["@type"]) ? item["@type"] : [item?.["@type"]];
        if (kinds.some((type) => /Organization|Corporation|LocalBusiness|Store|Restaurant|Hotel|MedicalBusiness|BankOrCreditUnion/i.test(type || "")) && typeof item.name === "string")
          headings.push(item.name);
      }
    } catch { /* Ignore invalid public markup. */ }
  }
  const body = $("body").text().slice(0, 20000);
  const parked = /domain (?:is )?(?:for sale|expired|parked)|buy this domain|this domain (?:has expired|is parked)|website coming soon|account suspended|site not found/i;
  if (parked.test(pageTitle) || parked.test(body.slice(0, 4000)))
    return { status: "unavailable" };
  const normalize = (value) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const tokens = normalize(name || "").split(" ").filter((word) => word.length >= 3 && !generic.has(word));
  if (!tokens.length) return { status: "needs_review" };
  const matched = headings.some((heading) => {
    const text = " " + normalize(heading) + " ";
    return tokens.filter((word) => text.includes(" " + word + " ")).length >= Math.ceil(tokens.length * 0.65);
  });
  return matched ? { status: "verified" } : { status: "needs_review" };
}
