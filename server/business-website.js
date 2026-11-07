import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { load } from "cheerio";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";
import { businessEmail, webUrl } from "./lead-discovery.js";

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

export function extractContacts(html, source) {
  const $ = load(html);
  $("script,style,noscript,template,[hidden],[aria-hidden='true']").remove();
  const publicText = $("body").text();
  const links = $("a[href]")
    .map((_, a) => $(a).attr("href"))
    .get();
  const emails = [
    ...links
      .filter((link) => /^mailto:/i.test(link))
      .map((link) => link.slice(7).split("?")[0]),
    ...(publicText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []),
  ]
    .map(businessEmail)
    .filter(Boolean);
  const phones = links
    .filter((link) => /^tel:/i.test(link))
    .map((link) => link.slice(4).trim())
    .filter((phone) => /^\+?[\d(). -]{7,24}$/.test(phone));
  return {
    emails: [...new Set(emails)].slice(0, 5),
    phones: [...new Set(phones)].slice(0, 5),
    source,
    links,
  };
}

export async function scanBusinessWebsite(website) {
  const entry = webUrl(website);
  if (!entry)
    throw Object.assign(
      new Error("Enter a public website address beginning with https://"),
      { status: 400 },
    );
  const signal = AbortSignal.timeout(10500);
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
    const home = extractContacts(page.text, page.url);
    const contact = home.links
      .flatMap((link) => {
        try {
          return [new URL(link, page.url)];
        } catch {
          return [];
        }
      })
      .find(
        (link) =>
          link.origin === new URL(page.url).origin &&
          /\/(?:contact(?:[-_]?us)?|get-in-touch)\/?$/i.test(link.pathname) &&
          link.href !== page.url &&
          allowed(link.href),
      );
    const results = [home];
    if (contact) {
      const other = await fetchPage(contact.href, signal, 0, allowed).catch(
        () => null,
      );
      if (other?.status === 200 && other.text)
        results.push(extractContacts(other.text, other.url));
    }
    return results
      .filter((row) => row.emails.length || row.phones.length)
      .map(({ source, emails, phones }) => ({ source, emails, phones }));
  } catch (error) {
    const messages = [
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
