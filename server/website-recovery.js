import { scanBusinessWebsite } from "./business-website.js";
import { groundedBusinessSearch } from "./grounded-search.js";
const digits = (value) =>
  String(value || "")
    .replace(/\D/g, "")
    .replace(/^0/, "234");
const words = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function corroboratesBusiness(item, pages) {
  const phones = pages.flatMap((p) => p.phones || []);
  if (item.phone && phones.some((p) => digits(p) === digits(item.phone)))
    return true;
  const location = words([item.city, item.region].filter(Boolean).join(" "))
    .split(" ")
    .filter((w) => w.length > 2);
  const addresses = pages.map((p) => words(p.details?.address)).filter(Boolean);
  return (
    location.length > 0 &&
    addresses.some((address) =>
      location.some((token) =>
        (" " + address + " ").includes(" " + token + " "),
      ),
    )
  );
}
export async function resolveBusinessWebsite(
  env,
  item,
  { scan = scanBusinessWebsite, search = groundedBusinessSearch } = {},
) {
  let originalError = "No website is listed for this business.";
  if (item.website) {
    try {
      return {
        websiteStatus: "verified",
        website: item.website,
        contacts: await scan(item.website, {
          country: item.country || "NG",
          expectedName: item.name,
        }),
        recovered: false,
      };
    } catch (error) {
      originalError = error.message;
    }
  }
  const found = await search(
    env,
    {
      name: item.name,
      city: item.city,
      region: item.region,
      country: item.country || "NG",
      phone: item.phone,
      task: "Locate the official website of this exact business. Prefer matching public phone and location.",
    },
    { limit: 4 },
  );
  for (const candidate of found.candidates.slice(0, 3)) {
    if (candidate.website === item.website) continue;
    try {
      const contacts = await scan(candidate.website, {
        country: item.country || "NG",
        expectedName: item.name,
      });
      if (!corroboratesBusiness(item, contacts)) continue;
      return {
        websiteStatus: "verified",
        website: candidate.website,
        contacts,
        recovered: true,
      };
    } catch {
      /* A search suggestion never becomes a verified domain without first-party evidence. */
    }
  }
  return {
    websiteStatus: originalError.includes("parked")
      ? "unavailable"
      : "needs_review",
    website: null,
    contacts: [],
    recovered: false,
    error:
      originalError +
      (found.available
        ? " No replacement website could be confirmed for this business."
        : " Website recovery search is temporarily unavailable; try again later."),
    recoveryAvailable: found.available,
  };
}
