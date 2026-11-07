import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app.js";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
const origin = "http://127.0.0.1:5192",
  db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  ),
  users = [],
  orgs = [];
const ok = (r) => {
  if (r.error) throw Error(r.error.message);
  return r.data;
};
const originalFetch = globalThis.fetch;
let advisorCalls = 0;
globalThis.fetch = async (url, options) => {
  if (String(url).includes("generativelanguage.googleapis.com")) {
    advisorCalls++;
    const body = JSON.parse(options.body);
    assert.ok(body.contents[0].parts[0].text.includes("Acme QA"));
    assert.ok(
      body.contents[0].parts.some((p) => p.text?.includes("Attached document")),
    );
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  answer:
                    "Follow up on the Acme QA opportunity using the attached company overview.",
                  priorities: [
                    {
                      title: "Call Acme QA",
                      detail: "Confirm the proposal review date.",
                      page: "tasks",
                    },
                    {
                      title: "Invalid action",
                      detail: "blocked",
                      page: "https://malicious.example",
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    });
  }
  return originalFetch(url, options);
};
const app = createApp({
  env: { ...process.env, APP_URL: origin, GEMINI_API_KEY: "fixture-key" },
});
async function setup(label) {
  const email = "workflow-" + randomBytes(5).toString("hex") + "@example.com",
    password = randomBytes(20).toString("hex");
  const user = ok(
    await db.auth.admin.createUser({ email, password, email_confirm: true }),
  ).user;
  users.push(user.id);
  const agent = request.agent(app);
  assert.equal(
    (
      await agent
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({ email, password })
    ).status,
    200,
  );
  const created = await agent
    .post("/api/organizations")
    .set("Origin", origin)
    .send({ name: "Workflow " + label });
  assert.equal(created.status, 201);
  orgs.push(created.body.id);
  const org = created.body.id;
  return {
    agent,
    user,
    org,
    send: (method, path, body) =>
      agent[method]("/api" + path)
        .set("Origin", origin)
        .set("x-organization-id", org)
        .send(body),
  };
}
try {
  const a = await setup("A"),
    b = await setup("B");
  let r = await a.send("post", "/resources/offers", {
    name: "Acme QA offer",
    description: "Help retailers acquire customers",
    price: 100,
    currency: "USD",
  });
  assert.equal(r.status, 201, r.body.error);
  r = await a.send("post", "/resources/offers", {
    name: "Second active offer",
  });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Starter includes/);
  const p = await a.send("post", "/resources/prospects", {
    name: "Acme QA",
    email: "hello@example.com",
    phone: "+2348012345678",
    website: "https://example.com",
  });
  assert.equal(p.status, 201, p.body.error);
  const prospect = p.body.data;
  r = await a.send("post", "/resources/contacts", {
    full_name: "Acme QA team",
    email: prospect.email,
    phone: prospect.phone,
    prospect_id: prospect.id,
  });
  assert.equal(r.status, 201);
  const contact = r.body.data;
  const list = await a.send("post", "/resources/lists", {
    name: "Retail audience",
  });
  assert.equal(list.status, 201);
  r = await a.send("post", "/resources/list_contacts", {
    list_id: list.body.data.id,
    contact_id: contact.id,
  });
  assert.equal(r.status, 201);
  const deal = await a.send("post", "/resources/deals", {
    title: "Acme QA opportunity",
    prospect_id: prospect.id,
    value: 1000,
    stage: "proposal",
  });
  assert.equal(deal.status, 201);
  const task = await a.send("post", "/resources/tasks", {
    title: "Call Acme QA",
    deal_id: deal.body.data.id,
    due_at: "2020-01-01T09:00:00Z",
  });
  assert.equal(task.status, 201);
  r = await a.send("patch", "/resources/tasks/" + task.body.data.id, {
    status: "done",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, "done");
  r = await a.send("patch", "/resources/tasks/" + task.body.data.id, {
    status: "open",
  });
  assert.equal(r.status, 200);
  const doc = await a.agent
    .post("/api/documents?name=overview.txt")
    .set("Origin", origin)
    .set("x-organization-id", a.org)
    .set("Content-Type", "text/plain")
    .send("Acme QA sells logistics services to Nigerian retailers.");
  assert.equal(doc.status, 201, doc.body.error);
  const docid = doc.body.data.id;
  r = await a.send("get", "/documents/" + docid);
  assert.equal(r.status, 200);
  assert.match(r.body.url, /token=/);
  r = await b.send("get", "/documents/" + docid);
  assert.notEqual(r.status, 200);
  r = await b.send("post", "/advisor", {
    question: "Read Acme QA overview",
    document_ids: [docid],
  });
  assert.equal(r.status, 403);
  r = await a.send("post", "/advisor", {
    question: "How should we follow up with Acme QA?",
    document_ids: [docid],
    history: [],
  });
  assert.equal(r.status, 200, r.body.error);
  assert.equal(r.body.aiAvailable, true);
  assert.equal(r.body.priorities.length, 1);
  assert.equal(advisorCalls, 1);
  const invalidPhoto = await a.agent.post("/api/organization/photo").set("Origin",origin).set("x-organization-id",a.org).set("Content-Type","image/png").send(Buffer.from("not a valid PNG image"));
  assert.equal(invalidPhoto.status,400);
  const deniedMaintenance = await b.send("post","/platform/catalog/review",{limit:1});assert.equal(deniedMaintenance.status,403);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3xkAAAAASUVORK5CYII=",
    "base64",
  );
  r = await a.agent
    .post("/api/organization/photo")
    .set("Origin", origin)
    .set("x-organization-id", a.org)
    .set("Content-Type", "image/png")
    .send(png);
  assert.equal(r.status, 201, r.body.error);
  r = await a.send("get", "/organization/photo");
  assert.equal(r.status, 200);
  assert.match(r.body.image, /^data:image\/png;base64,/);
  r = await b.send("get", "/organization/photo");
  assert.equal(r.body.image, null);
  r = await a.send("delete", "/organization/photo");
  assert.equal(r.status, 200);
  r = await a.send("delete", "/documents/" + docid);
  assert.equal(r.status, 200);
  const invite = await a.send("post", "/invitations", {
    email: "invite-" + randomBytes(4).toString("hex") + "@example.com",
    role: "member",
  });
  assert.equal(invite.status, 201, invite.body.error);
  r = await a.send("post", "/invitations", {
    email: "second-" + randomBytes(4).toString("hex") + "@example.com",
    role: "member",
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /team seats/);
  r = await a.send("delete", "/invitations/" + invite.body.invitation.id);
  assert.equal(r.status, 200);
  r = await a.send("post", "/prospects/enrich", {
    websites: Array.from({ length: 50 }, (_, i) => ({
      website: "http://127.0.0.1/" + i,
      country: "NG",
    })),
  });
  assert.equal(r.status, 200);
  assert.equal(r.text.trim().split("\n").length, 50);
  r = await a.send("get", "/research-usage");
  assert.equal(r.body.used, 50);
  assert.equal(r.body.limit, 500);
  const budgets = await Promise.all(
    Array.from({ length: 10 }, () =>
      db.rpc("reserve_research_credits", { org: a.org, units: 50 }),
    ),
  );
  assert.equal(budgets.filter((r) => r.data.allowed).length, 9);
  assert.equal(
    ok(await db.rpc("reserve_research_credits", { org: a.org, units: 0 })).used,
    500,
  );
  ok(
    await db
      .from("memberships")
      .update({ role: "viewer" })
      .eq("organization_id", a.org)
      .eq("user_id", a.user.id),
  );
  for (const path of ["/documents/" + docid, "/organization/photo"]) {
    r = await a.send("delete", path);
    assert.equal(r.status, 403);
  }
  console.log(
    "PASS connected prospect/contact/list/deal/task workflow; completion/reopen; private file upload/open/delete; explicit advisor attachments and validated actions; company photo isolation; seats/revocation; 50-site stream; atomic monthly credit cap; viewer write denials.",
  );
} finally {
  globalThis.fetch = originalFetch;
  for (const org of orgs) {
    const files = await db.storage.from("organization-documents").list(org);
    for (const folder of files.data || []) {
      const children = await db.storage
        .from("organization-documents")
        .list(org + "/" + folder.name);
      if (children.data?.length)
        await db.storage
          .from("organization-documents")
          .remove(
            children.data.map((f) => org + "/" + folder.name + "/" + f.name),
          );
    }
    await db.from("audit_events").delete().eq("organization_id", org);
    ok(await db.from("organizations").delete().eq("id", org));
    await db.from("audit_events").delete().eq("organization_id", org);
  }
  for (const id of users) ok(await db.auth.admin.deleteUser(id));
}
