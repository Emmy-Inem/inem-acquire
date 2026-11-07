import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import app from "../server/app.js";
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const origin = process.env.APP_URL,
  users = [],
  orgs = [],
  report = [];
const check = (name) => {
  report.push(name);
  console.log("PASS " + name);
};
const ok = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
async function account(label) {
  const email = `acquire-qa-${Date.now()}-${label}@example.com`,
    password = randomBytes(24).toString("base64url");
  const created = ok(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Integration " + label },
    }),
  );
  users.push(created.user.id);
  const agent = request.agent(app);
  const login = await agent
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email, password });
  assert.equal(login.status, 200, login.body.error);
  assert.ok(login.headers["set-cookie"].every((c) => c.includes("HttpOnly")));
  const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  ok(await db.auth.signInWithPassword({ email, password }));
  return { agent, db, id: created.user.id, email };
}
function post(a, path, org, body, supportId) {
  const req = a.agent.post("/api" + path)
    .set("Origin", origin)
    .set("x-organization-id", org);
  if (supportId) req.set("x-support-session-id", supportId);
  return req.send(body);
}
try {
  const a = await account("a"),
    b = await account("b");
  check("real password login uses HttpOnly cookies");
  for (const actor of [a, b]) {
    const r = await actor.agent
      .post("/api/organizations")
      .set("Origin", origin)
      .send({ name: "QA organization " + actor.id.slice(0, 6) });
    assert.equal(r.status, 201, r.body.error);
    actor.org = r.body.id;
    orgs.push(actor.org);
  }
  check("organizations and owner memberships created atomically");
  const offer = await post(a, "/resources/offers", a.org, {
    name: "Cloud support",
    price: 5000,
    currency: "NGN",
  });
  assert.equal(offer.status, 201, offer.body.error);
  check("deployed workspace edge function persists validated records");
  const hidden = ok(
    await b.db.from("offers").select("*").eq("organization_id", a.org),
  );
  assert.equal(hidden.length, 0);
  const forbidden = await post(b, "/resources/offers", a.org, {
    name: "Attack",
  });
  assert.equal(forbidden.status, 403);
  check("cross-tenant reads and writes blocked");
  const directRole = await b.db
    .from("memberships")
    .update({ role: "owner" })
    .eq("organization_id", a.org);
  assert.ok(directRole.error);
  const platformEscalation = await b.db
    .from("platform_roles")
    .insert({ user_id: b.id, role: "platform_owner" });
  assert.ok(platformEscalation.error);
  check("membership and platform-role escalation blocked");
  const pa = await post(a, "/resources/prospects", a.org, {
    name: "Company A",
  });
  const pb = await post(b, "/resources/prospects", b.org, {
    name: "Company B",
  });
  assert.equal(pa.status, 201, pa.body.error);
  assert.equal(pb.status, 201, pb.body.error);
  const badContact = await post(a, "/resources/contacts", a.org, {
    full_name: "Wrong company",
    prospect_id: pb.body.data.id,
  });
  assert.equal(badContact.status, 400);
  check("composite tenant foreign keys reject cross-organization links");
  const foreignAssignee = await post(a, "/resources/tasks", a.org, {
    title: "Invalid foreign assignee", assigned_to: b.id,
  });
  assert.equal(foreignAssignee.status, 400);
  check("tasks cannot be assigned to profiles outside their organization");
  ok(
    await admin
      .from("memberships")
      .insert({ organization_id: a.org, user_id: b.id, role: "viewer" }),
  );
  const viewer = await post(b, "/resources/tasks", a.org, {
    title: "Unauthorized task",
  });
  assert.equal(viewer.status, 403);
  const viewerRead = await b.agent
    .get("/api/resources/offers")
    .set("x-organization-id", a.org);
  assert.equal(viewerRead.status, 200);
  check("viewer role reads records but cannot mutate them");
  for (const [role, capabilities] of [
    ["member", { read: true, write: true, approve: false, manage: false }],
    ["manager", { read: true, write: true, approve: true, manage: false }],
    ["admin", { read: true, write: true, approve: true, manage: true }],
  ]) {
    ok(await admin.from("memberships").update({ role }).eq("organization_id", a.org).eq("user_id", b.id));
    assert.deepEqual(ok(await b.db.rpc("organization_permissions", { org: a.org })), capabilities);
    const ownTask = await post(b, "/resources/tasks", a.org, {
      title: "Role check " + role, assigned_to: b.id,
    });
    assert.equal(ownTask.status, 201, ownTask.body.error);
    ok(await admin.from("tasks").delete().eq("id", ownTask.body.data.id).eq("organization_id", a.org));
    const roleEscalation = await b.agent.patch("/api/team/" + b.id)
      .set("Origin", origin).set("x-organization-id", a.org).send({ role: "admin" });
    assert.equal(roleEscalation.status, role === "admin" ? 400 : 403);
  }
  ok(await admin.from("memberships").update({ role: "viewer" }).eq("organization_id", a.org).eq("user_id", b.id));
  check("member, manager and admin permissions match the role matrix and prevent escalation");
  const escalation = await a.agent
    .patch("/api/team/" + b.id)
    .set("Origin", origin)
    .set("x-organization-id", a.org)
    .send({ role: "owner" });
  assert.equal(escalation.status, 400);
  check("ownership is not assignable through team role changes");
  const deal = await post(a, "/resources/deals", a.org, {
    title: "Real test opportunity",
    value: 1000,
    currency: "NGN",
    prospect_id: pa.body.data.id,
  });
  assert.equal(deal.status, 201, deal.body.error);
  const task = await post(a, "/resources/tasks", a.org, {
    title: "Follow up",
    deal_id: deal.body.data.id,
  });
  assert.equal(task.status, 201, task.body.error);
  const completed = await a.agent
    .patch("/api/resources/tasks/" + task.body.data.id)
    .set("Origin", origin)
    .set("x-organization-id", a.org)
    .send({ status: "done" });
  assert.equal(completed.status, 200);
  check("deal and task changes persist through authenticated API");
  const diagnosis = await post(a, "/diagnosis", a.org, {});
  assert.equal(diagnosis.status, 200, diagnosis.body.error);
  assert.ok(diagnosis.body.data.evidence.records.prospects === 1);
  check(
    "deployed intelligence edge function diagnoses actual workspace evidence",
  );
  const campaign = await post(a, "/resources/campaigns", a.org, {
    name: "Test campaign",
    subject: "Test",
    body: "This is a test draft, never sent.",
  });
  assert.equal(campaign.status, 201, campaign.body.error);
  const disposableCampaign = await post(a, "/resources/campaigns", a.org, {
    name: "Disposable draft", subject: "Never sent", body: "Draft deletion check",
  });
  assert.equal(disposableCampaign.status, 201, disposableCampaign.body.error);
  const deleteCampaign = (actor, id, organization = a.org) => actor.agent
    .delete("/api/resources/campaigns/" + id).set("Origin", origin)
    .set("x-organization-id", organization);
  assert.equal((await deleteCampaign(b, disposableCampaign.body.data.id)).status, 403);
  const deletedDraft = await deleteCampaign(a, disposableCampaign.body.data.id);
  assert.equal(deletedDraft.status, 200, deletedDraft.body.error);
  assert.equal((await deleteCampaign(a, disposableCampaign.body.data.id)).status, 404);
  check("only authorized managers can delete an unsent draft campaign");
  const historyCampaign = await post(a, "/resources/campaigns", a.org, {
    name: "Delivery history guard", subject: "Never sent", body: "Synthetic test history",
  });
  assert.equal(historyCampaign.status, 201, historyCampaign.body.error);
  const historyContact = ok(await admin.from("contacts").insert({
    organization_id: a.org, full_name: "Synthetic recipient",
  }).select("id").single());
  const historyRecipient = ok(await admin.from("campaign_recipients").insert({
    organization_id: a.org, campaign_id: historyCampaign.body.data.id,
    contact_id: historyContact.id, status: "failed",
  }).select("id").single());
  assert.equal((await deleteCampaign(a, historyCampaign.body.data.id)).status, 409);
  check("drafts with previous delivery attempts cannot erase recipient history");
  const removeRecipient = (actor, id, organization = a.org) => actor.agent
    .delete("/api/resources/campaign_recipients/" + id).set("Origin", origin)
    .set("x-organization-id", organization);
  const makeRecipient = async () => {
    const added = await post(a, "/resources/campaign_recipients", a.org, {
      campaign_id: campaign.body.data.id, contact_id: historyContact.id,
    });
    assert.equal(added.status, 201, added.body.error);
    return added.body.data.id;
  };
  const removable = await makeRecipient();
  assert.equal((await removeRecipient(b, removable)).status, 403);
  assert.equal((await removeRecipient(b, removable, b.org)).status, 404);
  ok(await admin.from("memberships").update({ role: "member" }).eq("organization_id", a.org).eq("user_id", b.id));
  const removedRecipient = await removeRecipient(b, removable);
  assert.equal(removedRecipient.status, 200, removedRecipient.body.error);
  assert.equal((await removeRecipient(b, removable)).status, 404);
  ok(await admin.from("memberships").update({ role: "viewer" }).eq("organization_id", a.org).eq("user_id", b.id));
  assert.equal((await removeRecipient(a, historyRecipient.id)).status, 409);
  const protectedRecipient = await makeRecipient();
  check("writers can remove pending draft recipients; viewers, foreign tenants and delivery history are protected");
  const injected = await a.agent
    .patch("/api/resources/campaigns/" + campaign.body.data.id)
    .set("Origin", origin)
    .set("x-organization-id", a.org)
    .send({ status: "approved" });
  assert.equal(injected.status, 400);
  const approval = await post(
    a,
    "/campaigns/" + campaign.body.data.id + "/approve",
    a.org,
    {},
  );
  assert.equal(approval.status, 200, approval.body.error);
  const approvedDelete = await deleteCampaign(a, campaign.body.data.id);
  assert.equal(approvedDelete.status, 409, approvedDelete.body.error);
  assert.equal((await removeRecipient(a, protectedRecipient)).status, 409);
  check("campaign deletion preserves approved campaigns");
  const changed = await a.agent
    .patch("/api/resources/campaigns/" + campaign.body.data.id)
    .set("Origin", origin)
    .set("x-organization-id", a.org)
    .send({ subject: "Updated draft" });
  assert.equal(changed.status, 200, changed.body.error);
  assert.equal(changed.body.data.status, "draft");
  assert.equal(changed.body.data.approved_by, null);
  check("campaign editing clears approval; browser cannot forge approval");
  const missingProvider = await post(
    a,
    "/campaigns/" + campaign.body.data.id + "/send",
    a.org,
    {},
  );
  assert.equal(missingProvider.status, 503);
  check("missing email provider fails explicitly without sending messages");
  // This permission-matrix fixture contains every role; use a custom seat allowance.
  ok(await admin.from("billing_accounts").update({plan:"scale"}).eq("organization_id", a.org));
  const c = await account("invite");
  const invitation = await post(a, "/invitations", a.org, {
    email: c.email,
    role: "member",
  });
  assert.equal(invitation.status, 201, invitation.body.error);
  const inviteToken = invitation.body.inviteUrl.split("/").at(-1);
  const wrongAccept = await b.agent
    .post("/api/invitations/accept")
    .set("Origin", origin)
    .send({ token: inviteToken });
  assert.equal(wrongAccept.status, 400);
  const accepted = await c.agent
    .post("/api/invitations/accept")
    .set("Origin", origin)
    .send({ token: inviteToken });
  assert.equal(accepted.status, 200, accepted.body.error);
  const reused = await c.agent
    .post("/api/invitations/accept")
    .set("Origin", origin)
    .send({ token: inviteToken });
  assert.equal(reused.status, 400);
  check("invitation is single-use and bound to the invited verified email");
  const upload = await a.agent
    .post("/api/documents?name=evidence.txt")
    .set("Origin", origin)
    .set("x-organization-id", a.org)
    .set("Content-Type", "text/plain")
    .send("Integration test evidence");
  assert.equal(upload.status, 201, upload.body.error);
  const download = await a.agent
    .get("/api/documents/" + upload.body.data.id)
    .set("x-organization-id", a.org);
  assert.equal(download.status, 200, download.body.error);
  assert.ok(download.body.url.includes("/object/sign/"));
  const file = await fetch(download.body.url);
  assert.equal(await file.text(), "Integration test evidence");
  check("private document upload and expiring signed download work");
  ok(
    await admin
      .from("memberships")
      .delete()
      .eq("organization_id", a.org)
      .eq("user_id", b.id),
  );
  const ordinaryAdmin = await a.agent.get("/api/platform/organizations");
  assert.equal(ordinaryAdmin.status, 403);
  ok(
    await admin
      .from("platform_roles")
      .insert({ user_id: b.id, role: "platform_owner" }),
  );
  const supportDenied = await b.db
    .from("deals")
    .select("*")
    .eq("organization_id", a.org);
  assert.equal(supportDenied.data.length, 0); // platform ownership alone does not grant tenant data access
  const orgOutsideMembership = ok(await b.db.from("organizations").select("id").eq("id", a.org));
  assert.deepEqual(orgOutsideMembership, []);
  const ownerDirectory = await b.agent.get("/api/platform/organizations");
  assert.equal(ownerDirectory.status, 200);
  assert.ok(ownerDirectory.body.organizations.some((org) => org.id === a.org));
  const nameQuery = encodeURIComponent("QA organization " + a.id.slice(0, 6));
  const found = await b.agent.get("/api/platform/organizations?path=platform%2Forganizations&search=" + nameQuery);
  assert.equal(found.status, 200, found.body.error);
  assert.deepEqual(found.body.organizations.map((org) => org.id), [a.org]);
  assert.equal(found.body.organizations[0].operation_status, "routine");
  assert.ok(found.body.organizations[0].member_count >= 1);
  const detailPath = "/api/platform/organizations/" + a.org;
  const detail = await b.agent.get(detailPath);
  assert.equal(detail.status, 200, detail.body.error);
  assert.equal(detail.body.operations, null);
  assert.equal((await a.agent.get(detailPath)).status, 403);
  const update = { status: "attention", note: "QA private follow-up", updatedAt: null };
  assert.equal((await a.agent.patch(detailPath + "/operations").set("Origin", origin).send(update)).status, 403);
  const directUpdate = await a.db.rpc("set_platform_organization_operations", {
    target_org: a.org, next_status: "attention", next_note: "Rejected", expected_updated_at: null,
  });
  assert.equal(directUpdate.error?.code, "42501");
  const directRead = await a.db.from("platform_organization_operations").select("internal_note").eq("organization_id", a.org);
  assert.equal(directRead.error?.code, "42501");
  const updated = await b.agent.patch(detailPath + "/operations").set("Origin", origin).send(update);
  assert.equal(updated.status, 200, updated.body.error);
  const saved = await b.agent.get(detailPath);
  assert.equal(saved.body.operations.internal_note, update.note);
  assert.equal(saved.body.events[0].status, "attention");
  const filtered = await b.agent.get("/api/platform/organizations?status=attention&search=" + nameQuery);
  assert.deepEqual(filtered.body.organizations.map((org) => org.id), [a.org]);
  const stale = await b.agent.patch(detailPath + "/operations").set("Origin", origin).send({ ...update, note: "Stale edit" });
  assert.equal(stale.status, 409, stale.body.error);
  const latest = await b.agent.patch(detailPath + "/operations").set("Origin", origin).send({ status: "monitoring", note: update.note, updatedAt: saved.body.operations.updated_at });
  assert.equal(latest.status, 200, latest.body.error);
  check("platform directory and audited private follow-ups respect role and revision boundaries");
  const ownSupport = await post(b, "/platform/support", b.org, {
    organization_id: b.org,
    reason: "A membership must keep its existing permissions",
  });
  assert.equal(ownSupport.status, 403);
  const blockedCatalog = await a.db.from("discovery_catalog").select("overture_place_id").limit(1);
  assert.equal(blockedCatalog.error?.code, "42501");
  const query = { country: "NG", city: "Lagos", industry: "all" };
  const discovery = await post(a, "/prospects/public-directory", a.org, query);
  assert.equal(discovery.status, 200, discovery.body.error);
  assert.equal(discovery.body.companies.length, 20);
  assert.equal(discovery.body.hasMore, true);
  assert.ok(discovery.body.companies.every((row) =>
    row.catalog && ["Overture", "Foursquare"].includes(row.directory) &&
    row.release && (row.phone || row.email)));
  assert.ok(discovery.body.companies.every((row) =>
    row.directory !== "Foursquare" || row.id.startsWith("fsq:")));
  const next = await post(a, "/prospects/public-directory", a.org, { ...query, page: 2 });
  assert.equal(next.status, 200, next.body.error);
  assert.ok(next.body.companies.every((row) => !discovery.body.companies.some((first) => row.id === first.id)));
  const later = await post(a, "/prospects/public-directory", a.org, { country: "NG", industry: "all", page: 251, pageSize: 100, contact: "both" });
  assert.equal(later.status, 200, later.body.error);
  assert.equal(later.body.companies.length, 100);
  assert.ok(later.body.companies.every((row) => row.email && row.phone));
  assert.equal(later.body.hasMore, true);
  assert.deepEqual(Object.keys(later.body).sort(), ["companies", "hasMore"]);
  const beyondDenied = await post(a, "/prospects/search-beyond-catalog", b.org, { city: "Lagos", country: "NG", industry: "retail" });
  assert.equal(beyondDenied.status, 403);
  const crossOrgDiscovery = await post(a, "/prospects/public-directory", b.org, query);
  assert.equal(crossOrgDiscovery.status, 403);
  check("authenticated organization Discovery pages through the protected Nigerian catalog");
  const support = await b.agent
    .post("/api/platform/support")
    .set("Origin", origin)
    .send({
      organization_id: a.org,
      reason: "Integration test support access",
    });
  assert.equal(support.status, 200, support.body.error);
  const supportId = support.body.id;
  const unscoped = await post(b, "/resources/tasks", a.org, { title: "Unscoped support" });
  assert.equal(unscoped.status, 403);
  const scopedToWrongOrg = await post(b, "/resources/tasks", b.org, { title: "Wrong scope" }, supportId);
  assert.equal(scopedToWrongOrg.status, 403);
  const spoofed = await post(a, "/resources/tasks", a.org, { title: "Stolen session" }, supportId);
  assert.equal(spoofed.status, 403);
  const boot = await b.agent.get("/api/bootstrap");
  assert.ok(boot.body.supportSessions.some((item) => item.id === supportId && item.organizations.id === a.org));
  const supportManage = await b.agent.patch("/api/organization")
    .set("Origin", origin).set("x-organization-id", a.org)
    .set("x-support-session-id", supportId).send({ name: "Restricted" });
  assert.equal(supportManage.status, 403);
  const supportExport = await b.agent.get("/api/export/prospects")
    .set("x-organization-id", a.org).set("x-support-session-id", supportId);
  assert.equal(supportExport.status, 403);
  const supportWrite = await post(b, "/resources/tasks", a.org, { title: "Support follow-up" }, supportId);
  assert.equal(supportWrite.status, 201, supportWrite.body.error);
  await b.agent
    .delete("/api/platform/support/" + a.org)
    .set("Origin", origin)
    .send({});
  const afterSupport = await post(b, "/resources/tasks", a.org, {
    title: "Must be denied again",
  }, supportId);
  assert.equal(afterSupport.status, 403);
  check("platform-owner support access is time-limited, audited and revocable");
  const audit = ok(
    await admin
      .from("audit_events")
      .select("action")
      .eq("organization_id", a.org),
  );
  assert.ok(audit.some((r) => r.action === "support.started"));
  assert.ok(audit.some((r) => r.action === "support.ended"));
  check("support and business mutations produce an audit trail");
  console.log(JSON.stringify({ passed: report.length, checks: report }));
} finally {
  // Only fixture organizations and users created by this run are removed.
  for (const org of orgs) {
    await admin.from("support_sessions").delete().eq("organization_id", org);
    await admin.from("audit_events").delete().eq("organization_id", org);
    const docs = ok(
      await admin.from("documents").select("path").eq("organization_id", org),
    );
    if (docs.length)
      ok(
        await admin.storage
          .from("organization-documents")
          .remove(docs.map((d) => d.path)),
      );
    const r = await admin.from("organizations").delete().eq("id", org);
    await admin.from("audit_events").delete().eq("organization_id", org);
    if (r.error)
      console.error("Fixture cleanup requires review:", r.error.code);
  }
  for (const id of users) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error)
      console.error("Fixture user cleanup requires review:", r.error.code);
  }
}
