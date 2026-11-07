import { industries } from "../shared/research.js";

const industryPatterns = {
  technology:
    /software|technology|computing|telecom|web hosting|internet|mobile phone/i,
  logistics: /logistic|transport|shipping|freight|courier|airline/i,
  professional:
    /consulting|accounting|legal service|architect|advertising|public relations/i,
  property: /construction|real estate|property management|interior design/i,
  healthcare:
    /hospital|pharmacy|health care|healthcare|medical|pharmaceutical/i,
  hospitality: /hotel|hospitality|restaurant|travel|tourism|food service/i,
  retail: /retail|department store|supermarket|e-commerce|food stores/i,
  finance: /financial|banking|\bbank\b|finance|fintech|insurance/i,
};

export async function findWikidataBusinesses(
  { city, country, industry },
  webUrl,
) {
  const titleCase = city.replace(/(^|[ -])\p{L}/gu, (letter) =>
    letter.toUpperCase(),
  );
  const names = [...new Set([city, titleCase])].map(
    (name) => JSON.stringify(name) + "@en",
  );
  const query = `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?company ?companyLabel ?website ?sectorLabel WHERE {
  VALUES ?cityName { ${names.join(" ")} }
  ?city rdfs:label ?cityName; wdt:P17/wdt:P297 ${JSON.stringify(country)}.
  ?company wdt:P159 ?city; wdt:P856 ?website; wdt:P452 ?sector; rdfs:label ?companyLabel.
  ?sector rdfs:label ?sectorLabel.
  FILTER(LANG(?companyLabel) = "en" && LANG(?sectorLabel) = "en")
} LIMIT 120`;
  const endpoint = new URL("https://query.wikidata.org/sparql");
  endpoint.searchParams.set("query", query);
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent":
        "InemAcquireResearch/1.0 (+https://inem-acquire.vercel.app)",
    },
    signal: AbortSignal.timeout(8500),
  });
  if (!response.ok) throw new Error("Wikidata search unavailable");
  const { results } = await response.json();
  const companies = new Map();
  for (const row of results.bindings) {
    const id = /^https?:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/.exec(
      row.company?.value,
    )?.[1];
    const name = row.companyLabel?.value?.trim();
    const website = webUrl(row.website?.value);
    if (!id || !name || /^Q\d+$/.test(name) || !website || companies.has(id))
      continue;
    const sector = row.sectorLabel?.value || "";
    if (!industryPatterns[industry].test(sector)) continue;
    companies.set(id, {
      name: name.slice(0, 200),
      website,
      industry: sector.slice(0, 120) || industries[industry].label,
      country,
      source_url: "https://www.wikidata.org/wiki/" + id,
      directory: "Wikidata",
      email: null,
      phone: null,
    });
  }
  return [...companies.values()];
}
