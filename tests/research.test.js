import test from "node:test";
import assert from "node:assert/strict";
import {
  extractContacts,
  scanBusinessWebsite,
} from "../server/business-website.js";
import { findBusinesses } from "../server/lead-discovery.js";
import { suggestedNextSteps } from "../server/gemini.js";

test("only published business inboxes and phone links are extracted", () => {
  const row = extractContacts(
    '<a href="mailto:sales@example.org?subject=Hello">Sales</a><a href="tel:+234123456789">Call</a><p>jane.doe@example.org</p><script>info@hidden.org</script><p hidden>hello@hidden.org</p>',
    "https://example.org/contact",
  );
  assert.deepEqual(row.emails, ["sales@example.org"]);
  assert.deepEqual(row.phones, ["+234123456789"]);
  assert.equal(row.source, "https://example.org/contact");
});

test("website scans reject loopback, link-local, and IPv4-mapped loopback", async () => {
  for (const host of ["127.0.0.1", "169.254.169.254", "[::ffff:127.0.0.1]"]) {
    await assert.rejects(
      scanBusinessWebsite("http://" + host),
      /Only public business websites/,
    );
  }
});

test("published organization markup adds company facts and normalizes phone numbers", () => {
  const row = extractContacts(
    `<script type="application/ld+json">
    {"@graph":[{"@type":"Organization","name":"Example HQ","address":{"streetAddress":"12 Example St","addressLocality":"Lagos"},"numberOfEmployees":{"value":32},"sameAs":["https://www.linkedin.com/company/example/"],"contactPoint":{"email":"sales@example.org","telephone":"0803 123 4567"}},{"@type":"Person","email":"admin@private.example","telephone":"+12025550123"}]}
    </script>`,
    "https://example.org/contact",
    "NG",
  );
  assert.deepEqual(row.emails, ["sales@example.org"]);
  assert.deepEqual(row.phones, ["+2348031234567"]);
  assert.deepEqual(row.details, {
    name: "Example HQ",
    address: "12 Example St, Lagos",
    linkedin: "https://www.linkedin.com/company/example/",
    employees: "32",
  });
});

test("directory results preserve attribution, omit private inboxes, and reuse a cached search", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url) => {
    if (url.hostname === "query.wikidata.org")
      return Response.json({ results: { bindings: [] } });
    assert.match(
      url.searchParams.get("data"),
      /"ISO3166-1"="NG".*"name"~"\^Lagos\$",i/,
    );
    return Response.json({
      elements: [
        {
          type: "node",
          id: 42,
          tags: {
            name: "Example IT",
            office: "it",
            website: "https://example.org",
            email: "sales@example.org",
          },
        },
        {
          type: "way",
          id: 43,
          tags: {
            name: "Example Hosting",
            office: "it",
            website: "javascript:alert(1)",
            email: "jane.doe@example.org",
          },
        },
      ],
    });
  });
  const query = { city: "Lagos", country: "NG", industry: "technology" };
  const result = await findBusinesses({}, query);
  assert.equal(
    result.companies[0].source_url,
    "https://www.openstreetmap.org/node/42",
  );
  assert.equal(result.companies[0].email, "sales@example.org");
  assert.equal(result.companies[1].email, null);
  assert.equal(result.companies[1].website, null);
  assert.deepEqual(await findBusinesses({}, query), result);
  assert.equal(fetch.mock.callCount(), 2);
});

test("Gemini receives standard topics only and failure leaves the evidence flow usable", async (t) => {
  let request;
  const fetch = t.mock.method(globalThis, "fetch", async (_url, options) => {
    request = JSON.parse(options.body);
    return Response.json({
      candidates: [
        {
          content: { parts: [{ text: '{"steps":["Schedule a follow-up."]}' }] },
        },
      ],
    });
  });
  const findings = [
    {
      source: "deals",
      detail: "A private deal",
      record_ids: ["private-record-id"],
    },
  ];
  assert.deepEqual(
    await suggestedNextSteps({ GEMINI_API_KEY: "test" }, findings, "tasks"),
    ["Schedule a follow-up."],
  );
  assert.deepEqual(JSON.parse(request.contents[0].parts[0].text), {
    topics: ["Following up with open opportunities"],
    focus: "Prioritizing overdue follow-ups",
  });
  fetch.mock.mockImplementation(
    async () => new Response(null, { status: 429 }),
  );
  assert.deepEqual(
    await suggestedNextSteps({ GEMINI_API_KEY: "test" }, findings),
    [],
  );
});
