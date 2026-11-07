import { extractContacts } from "../server/business-website.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveBusinessWebsite,
  corroboratesBusiness,
} from "../server/website-recovery.js";
import { fallbackAdvice, workspaceFacts } from "../server/sales-advisor.js";
import { groundedBusinessSearch } from "../server/grounded-search.js";
import { findOutsideCatalog } from "../server/extended-discovery.js";

test("website recovery never accepts an AI suggestion without corroborating business evidence", async () => {
  const item = {
    name: "Acme Nigeria",
    website: "https://old.example/",
    phone: "+2348012345678",
    city: "Lagos",
  };
  const result = await resolveBusinessWebsite({}, item, {
    scan: async (url) => {
      if (url === item.website)
        throw Error("This website is unavailable or parked.");
      return [{ phones: ["+2348099999999"], details: { address: "London" } }];
    },
    search: async () => ({
      available: true,
      candidates: [{ website: "https://wrong.example/" }],
    }),
  });
  assert.equal(result.website, null);
  assert.equal(result.websiteStatus, "unavailable");
  assert.match(result.error, /No replacement website could be confirmed/);
});
test("website recovery confirms a replacement only after company identity and public phone or address match", async () => {
  const pages = [
    {
      source: "https://new.example/contact",
      phones: ["+2348012345678"],
      emails: ["sales@new.example"],
      details: { name: "Acme" },
    },
  ];
  const result = await resolveBusinessWebsite(
    {},
    {
      name: "Acme",
      website: "https://old.example/",
      phone: "+2348012345678",
      city: "Lagos",
    },
    {
      scan: async (url) => {
        if (url.includes("old.")) throw Error("Could not read");
        return pages;
      },
      search: async () => ({
        available: true,
        candidates: [{ website: "https://new.example/" }],
      }),
    },
  );
  assert.equal(result.websiteStatus, "verified");
  assert.equal(result.website, "https://new.example/");
  assert.equal(result.recovered, true);
  assert.deepEqual(result.contacts, pages);
  assert.equal(
    corroboratesBusiness({ city: "Lagos" }, [
      { details: { address: "14 Marina, Lagos, NG" } },
    ]),
    true,
  );
  assert.equal(
    corroboratesBusiness({ city: "Lagos" }, [
      { details: { address: "London" } },
    ]),
    false,
  );
});
test("a working original website is kept without asking AI to replace it", async () => {
  const result = await resolveBusinessWebsite(
    {},
    { name: "Acme", website: "https://example.org/" },
    {
      scan: async () => [],
      search: async () => {
        throw Error("should not search");
      },
    },
  );
  assert.equal(result.websiteStatus, "verified");
  assert.equal(result.recovered, false);
});
test("advisor fallback answers the question with tenant evidence instead of repeating one summary", () => {
  const facts = workspaceFacts(
    {
      offers: [{}],
      icps: [{}],
      prospects: [{}],
      contacts: [],
      campaigns: [],
      deals: [{ id: "d", stage: "proposal" }],
      tasks: [
        { id: "t", title: "Call buyer", status: "open", due_at: "2020-01-01" },
      ],
    },
    new Date("2026-11-07"),
  );
  const tasks = fallbackAdvice("What should I follow up on today?", facts),
    pipeline = fallbackAdvice("How is my pipeline?", facts);
  assert.match(tasks.answer, /1 open follow-ups are overdue/);
  assert.match(pipeline.answer, /1 deals are open/);
  assert.notEqual(tasks.answer, pipeline.answer);
  assert.equal(tasks.aiAvailable, false);
});
test("web search rejects unsupported AI contact data without search grounding", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  candidates: [
                    { name: "Invented", website: "https://invented.example/" },
                  ],
                }),
              },
            ],
          },
        },
      ],
    }),
  );
  const result = await groundedBusinessSearch(
    { GEMINI_API_KEY: "test" },
    { city: "Lagos", country: "NG" },
  );
  assert.deepEqual(result.candidates, []);
  assert.equal(result.available, false);
});
test("expanded discovery can return 50 distinct matches instead of a six-row or 40-row cap", async (t) => {
  t.mock.method(globalThis, "fetch", async (address) => {
    const url = new URL(address);
    if (url.hostname === "query.wikidata.org")
      return new Response(null, { status: 503 });
    return Response.json({
      elements: Array.from({ length: 80 }, (_, i) => ({
        type: "node",
        id: i + 100,
        tags: { name: "Bakery " + i, shop: "bakery", phone: "+2348012345678" },
      })),
    });
  });
  const db = {
    rpc: async () => ({ data: [] }),
    from() {
      throw Error("No snapshot in fixture");
    },
  };
  const result = await findOutsideCatalog({}, db, {
    city: "Ibadan50-test",
    country: "NG",
    industry: "all",
    keyword: "bakery",
  });
  assert.equal(result.companies.length, 50);
  assert.equal(result.target, 50);
});

test("explicitly published business mail links can expose named inboxes without harvesting personal body text", () => {
  const result = extractContacts(
    '<a href="mailto:business.owner@gmail.com">Contact our business</a><p>private.person@example.org</p>',
    "https://company.example/contact",
  );
  assert.deepEqual(result.emails, ["business.owner@gmail.com"]);
});
