import { load } from "cheerio";
import {
  findPhoneNumbersInText,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import { businessEmail, webUrl } from "./lead-discovery.js";

const asList = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const strings = (value) =>
  asList(value).filter((item) => typeof item === "string");
const clean = (value, limit = 220) =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, limit)
    : "";

function companyProfiles($) {
  return $('script[type="application/ld+json"]')
    .slice(0, 24)
    .toArray()
    .flatMap((script) => {
      try {
        const data = JSON.parse($(script).text());
        return asList(data)
          .flatMap((item) => [item, ...asList(item?.["@graph"])])
          .filter((item) =>
            strings(item?.["@type"]).some((type) =>
              /(?:Organization|Corporation|LocalBusiness|ProfessionalService|Store|Restaurant|Hotel|MedicalBusiness|BankOrCreditUnion|RealEstateAgent)$/i.test(
                type,
              ),
            ),
          );
      } catch {
        return [];
      }
    });
}

function addressOf(profile) {
  for (const value of asList(profile.address)) {
    const formatted =
      typeof value === "string"
        ? clean(value)
        : [
            value?.streetAddress,
            value?.addressLocality,
            value?.addressRegion,
            value?.postalCode,
            value?.addressCountry?.name ?? value?.addressCountry,
          ]
            .map((part) => clean(part, 100))
            .filter(Boolean)
            .join(", ");
    if (formatted) return formatted.slice(0, 350);
  }
  return "";
}

export function extractContacts(html, source, country) {
  const $ = load(html);
  const profiles = companyProfiles($);
  $("script,style,noscript,template,[hidden],[aria-hidden='true']").remove();
  const publicText = $("body").text();
  const links = $("a[href]")
    .map((_, element) => $(element).attr("href"))
    .get();
  const contactPoints = profiles
    .flatMap((profile) => [profile, ...asList(profile.contactPoint)])
    .filter(Boolean);
  const emails = [
    ...links
      .filter((link) => /^mailto:/i.test(link))
      .map((link) => link.slice(7).split("?")[0]),
    ...contactPoints.flatMap((point) => strings(point.email)),
    ...(publicText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []),
  ]
    .map(businessEmail)
    .filter(Boolean);
  const phoneValues = [
    ...links.filter((link) => /^tel:/i.test(link)).map((link) => link.slice(4)),
    ...contactPoints.flatMap((point) => strings(point.telephone)),
  ];
  // Read contact areas and international numbers on dedicated contact pages.
  const contactText = $(
    "address,[itemprop='telephone'],a[href^='tel:'],footer,[id*='contact']",
  )
    .text()
    .slice(0, 25000);
  const textPhones = findPhoneNumbersInText(contactText, country).map(
    (result) => result.number.number,
  );
  if (
    /\/(?:contact[^/]*|get-in-touch|locations?|offices?)\/?$/i.test(
      new URL(source).pathname,
    )
  ) {
    for (const value of publicText.match(/\+\d[\d ().-]{7,22}\d/g) || []) {
      const phone = parsePhoneNumberFromString(value);
      if (phone?.isPossible()) textPhones.push(phone.number);
    }
  }
  const phones = phoneValues.flatMap((value) => {
    const parsed = parsePhoneNumberFromString(value.trim(), {
      defaultCountry: country,
      extract: false,
    });
    if (parsed?.isPossible()) return [parsed.number];
    const raw = value.trim();
    return /^\+?[\d(). -]{7,24}$/.test(raw) &&
      raw.replace(/\D/g, "").length >= 7
      ? [raw]
      : [];
  });
  const linkedin = [
    ...profiles.flatMap((profile) => strings(profile.sameAs)),
    ...links,
  ]
    .map(webUrl)
    .find(
      (value) =>
        value &&
        /^https:\/\/(?:[a-z]+\.)?linkedin\.com\/company\/[\w%-]+\/?(?:\?|$)/i.test(
          value,
        ),
    );
  const employees = profiles
    .map(
      (profile) =>
        profile.numberOfEmployees?.value ?? profile.numberOfEmployees,
    )
    .map((value) =>
      typeof value === "number" || typeof value === "string"
        ? clean(String(value), 30)
        : "",
    )
    .find((value) => /^\d+(?:\s*[-–]\s*\d+|\+)?$/.test(value));
  return {
    emails: [...new Set(emails)].slice(0, 5),
    phones: [...new Set([...phones, ...textPhones])].slice(0, 5),
    source,
    links,
    details: {
      name:
        profiles.map((profile) => clean(profile.name, 200)).find(Boolean) ||
        null,
      address:
        profiles.map(addressOf).find(Boolean) ||
        clean($("address").first().text(), 220),
      linkedin: linkedin || null,
      employees: employees || null,
    },
  };
}
