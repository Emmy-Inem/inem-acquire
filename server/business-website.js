import { websiteIdentity } from "./website-identity.js";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";
import { webUrl } from "./lead-discovery.js";
import { extractContacts } from "./website-evidence.js";
export { extractContacts } from "./website-evidence.js";

const agent = "InemAcquireResearch/1.0 (+https://inem-acquire.vercel.app)";
const MAX_BYTES = 512 * 1024;

async function fetchPage(value, signal, hops = 0, allowed = () => true) {
  const url = new URL(value);
  if (!webUrl(value) || url.port || hops > 3)
    throw new Error("Unsupported website address");
  if (!allowed(url.href))
    throw new Error("The website restricts automated access");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true });
  if (
    signal.aborted ||
    !addresses.length ||
    addresses.some(
      ({ address }) => ipaddr.process(address).range() !== "unicast",
    )
  ) {
    throw new Error("Only public business websites can be checked");
  }
  const chosen =
    addresses.find((address) => address.family === 4) || addresses[0];
  const response = await new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      url,
      {
        agent: false,
        signal,
        autoSelectFamily: false,
        lookup: (_host, options, cb) =>
          options.all
            ? cb(null, [chosen])
            : cb(null, chosen.address, chosen.family),
        headers: {
          "User-Agent": agent,
          Accept: "text/html, text/plain;q=0.9",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const status = res.statusCode;
        if (status < 200 || status >= 300) {
          res.destroy();
          resolve({ status, location: res.headers.location });
          return;
        }
        if (
          !/^text\/(?:html|plain)\b/i.test(res.headers["content-type"] || "")
        ) {
          res.destroy();
          reject(new Error("Only HTML or plain text pages are supported"));
          return;
        }
        let size = 0;
        const chunks = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) res.destroy(new Error("Page too large"));
          else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({ status, text: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
  if (
    [301, 302, 303, 307, 308].includes(response.status) &&
    response.location
  ) {
    // Follow only same-site redirects, including the conventional www alias.
    const next = new URL(response.location, url);
    if (
      next.hostname.replace(/^www\./, "") !== url.hostname.replace(/^www\./, "")
    )
      throw new Error("Enter the destination business website directly");
    return fetchPage(next.href, signal, hops + 1, allowed);
  }
  return { ...response, url: url.href };
}

export async function scanBusinessWebsite(
  website,
  { country, signal: caller, expectedName } = {},
) {
  const entry = webUrl(website);
  if (!entry)
    throw Object.assign(
      new Error("Enter a public website address beginning with https://"),
      { status: 400 },
    );
  const deadline = AbortSignal.timeout(10500);
  const signal = caller ? AbortSignal.any([caller, deadline]) : deadline;
  try {
    const robotsUrl = new URL("/robots.txt", entry);
    const robots = await fetchPage(robotsUrl.href, signal);
    if (
      robots.status !== 404 &&
      robots.status !== 410 &&
      robots.status !== 200
    ) {
      throw new Error("The website restricts automated access");
    }
    const policy = robotsParser(robotsUrl.href, robots.text || "");
    const allowed = (value) => {
      const url = new URL(value);
      const canonical = new URL(robotsUrl.origin);
      canonical.pathname = url.pathname;
      canonical.search = url.search;
      return policy.isAllowed(canonical.href, "InemAcquireResearch") !== false;
    };
    const page = await fetchPage(entry, signal, 0, allowed);
    if (page.status !== 200 || !page.text)
      throw new Error("The website did not return an accessible page");
    if (expectedName) {
      const identity = websiteIdentity(page.text, expectedName);
      if (identity.status !== "verified") throw new Error(
        identity.status === "unavailable"
          ? "This website is unavailable or parked."
          : "This website could not be matched to the business.",
      );
    }
    const home = extractContacts(page.text, page.url, country);
    const origin = new URL(page.url).origin;
    const candidates = new Map();
    const priorities = [
      /(?:^|\/)(?:contact(?:[-_]?us)?|get-in-touch)(?:\/|$)/i,
      /(?:^|\/)(?:locations?|offices?|branches|support)(?:\/|$)/i,
      /(?:^|\/)(?:about(?:[-_]?us)?|company)(?:\/|$)/i,
    ];
    for (const link of home.links) {
      try {
        const url = new URL(link, page.url);
        const priority = priorities.findIndex((pattern) =>
          pattern.test(url.pathname),
        );
        url.hash = "";
        if (
          priority < 0 ||
          url.origin !== origin ||
          url.href === page.url ||
          !allowed(url.href)
        )
          continue;
        candidates.set(url.href, priority);
      } catch {
        // Ignore malformed page links.
      }
    }
    if (
      ![...candidates.values()].includes(0) &&
      !home.emails.length &&
      !home.phones.length
    ) {
      const contact = new URL("/contact", origin).href;
      if (allowed(contact) && contact !== page.url) candidates.set(contact, 0);
    }
    const results = [home];
    for (const [url] of [...candidates]
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)) {
      if (signal.aborted) break;
      const other = await fetchPage(url, signal, 0, allowed).catch(() => null);
      if (other?.status === 200 && other.text)
        results.push(extractContacts(other.text, other.url, country));
    }
    return results
      .filter(
        (row) =>
          row.emails.length ||
          row.phones.length ||
          Object.values(row.details).some(Boolean),
      )
      .map(({ source, emails, phones, details }) => ({
        source,
        emails,
        phones,
        details,
      }));
  } catch (error) {
    const messages = [
      "This website is unavailable or parked.",
      "This website could not be matched to the business.",
      "Only public business websites can be checked",
      "The website restricts automated access",
      "The website did not return an accessible page",
      "Enter the destination business website directly",
    ];
    throw Object.assign(
      new Error(
        messages.includes(error.message)
          ? error.message
          : "Could not read this public website. Check the address or try its contact page directly.",
      ),
      { status: 422 },
    );
  }
}
