import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app.js";
import { canRole, assignableRoles, canManageMember } from "../shared/permissions.js";
import { canRole as resourceCanRole } from "../shared/resources.js";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-key",
  APP_URL: "http://127.0.0.1:5173",
};
const org = "10000000-0000-4000-8000-000000000001";
const record = "20000000-0000-4000-8000-000000000002";

test("one strict capability matrix is shared by the frontend and backend", () => {
  assert.equal(canRole, resourceCanRole);
  const expected = {
    owner: [true, true, true, true],
    admin: [true, true, true, true],
    manager: [true, true, true, false],
    member: [true, true, false, false],
    viewer: [true, false, false, false],
  };
  for (const [role, matrix] of Object.entries(expected)) {
    for (const [index, action] of ["read", "write", "approve", "manage"].entries())
      assert.equal(canRole(role, action), matrix[index], `${role}:${action}`);
    assert.equal(canRole(role, "unexpected_capability"), false);
    assert.equal(canRole(role, "__proto__"), false);
  }
  for (const role of [undefined, null, "platform_owner", "platform_support", "toString", "__proto__"])
    for (const action of ["read", "write", "manage"])
      assert.equal(canRole(role, action), false);
});

test("only owners can appoint or alter administrators; ownership stays protected", () => {
  assert.deepEqual(assignableRoles("owner"), ["admin", "manager", "member", "viewer"]);
  assert.deepEqual(assignableRoles("admin"), ["manager", "member", "viewer"]);
  assert.equal(canManageMember("owner", "admin"), true);
  assert.equal(canManageMember("owner", "owner"), false);
  assert.equal(canManageMember("admin", "admin"), false);
  assert.equal(canManageMember("admin", "member"), true);
  assert.equal(canManageMember("platform_support", "member"), false);
});

test("restricted organization roles are denied before mutation, export or provider calls", async () => {
  const endpoints = [
    ["post", "/api/resources/tasks", "write"],
    ["patch", `/api/resources/tasks/${record}`, "write"],
    ["delete", `/api/resources/tasks/${record}`, "approve"],
    ["delete", `/api/resources/campaign_recipients/${record}`, "write"],
    ["post", `/api/campaigns/${record}/approve`, "approve"],
    ["post", `/api/campaigns/${record}/send`, "approve"],
    ["get", "/api/export/contacts", "approve"],
    ["patch", `/api/team/${record}`, "manage"],
    ["post", "/api/invitations", "manage"],
    ["patch", "/api/organization", "manage"],
    ["get", "/api/integrations", "read"],
    ["post", "/api/integrations/gemini", "manage"],
    ["post", "/api/integrations/gemini/test", "manage"],
    ["delete", "/api/integrations/gemini", "manage"],
    ["post", "/api/billing/checkout", "manage"],
    ["post", "/api/billing/portal", "manage"],
  ];
  for (const role of ["viewer", "member", "manager"]) {
    const app = createApp({ env, clientFactory: () => ({
      auth: { getUser: async () => ({ data: { user: { id: record } } }) },
      rpc: async (name) => {
        assert.equal(name, "organization_permissions");
        return { data: Object.fromEntries(["read", "write", "approve", "manage"].map(action => [action, canRole(role, action)])) };
      },
      from: () => { throw new Error("A denied role reached the database"); },
    }) });
    for (const [method, path, capability] of endpoints.filter(([, , action]) => !canRole(role, action))) {
      let operation = request(app)[method](path).set("Origin", env.APP_URL)
        .set("Cookie", "ac-access=test-token").set("x-organization-id", org);
      if (!["get", "delete"].includes(method)) operation = operation.send({});
      const response = await operation;
      assert.equal(response.status, 403, `${role} ${method} ${path} (${capability})`);
    }
  }
});

test("profile edits require a session and only update the authenticated user's display name", async () => {
  let writes = 0;
  const app = createApp({ env, clientFactory: () => ({
    auth: { getUser: async () => ({ data: { user: { id: record } } }) },
    from: (table) => {
      assert.equal(table, "profiles");
      return { update: (values) => {
        writes++;
        assert.deepEqual(values, { full_name: "New Display Name" });
        return { eq: (column, id) => {
          assert.equal(column, "id");
          assert.equal(id, record);
          return { select: (columns) => {
            assert.equal(columns, "id,full_name");
            return { single: async () => ({ data: { id: record, ...values } }) };
          } };
        } };
      } };
    },
  }) });
  const edit = (body, signedIn = true) => {
    let call = request(app).patch("/api/profile").set("Origin", env.APP_URL);
    if (signedIn) call = call.set("Cookie", "ac-access=test-token");
    return call.send(body);
  };
  assert.equal((await edit({ full_name: "New Display Name" }, false)).status, 401);
  for (const body of [{ full_name: "x" }, { full_name: "New Display Name", role: "platform_owner" }, { full_name: "New Display Name", id: org }, {}])
    assert.equal((await edit(body)).status, 400);
  assert.equal(writes, 0);
  const saved = await edit({ full_name: "  New Display Name  " });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, { profile: { id: record, full_name: "New Display Name" } });
  assert.equal(writes, 1);
});

test("all organization readers can inspect integration availability without receiving secrets", async () => {
  for (const role of ["viewer", "member", "manager", "admin", "owner"]) {
    const app = createApp({ env: { ...env, RESEND_API_KEY: "private-test-secret", OUTBOUND_FROM: "test@example.com" }, clientFactory: () => ({
      auth: { getUser: async () => ({ data: { user: { id: record } } }) },
      rpc: async () => ({ data: Object.fromEntries(["read", "write", "approve", "manage"].map(action => [action, canRole(role, action)])) }),
      from: () => { throw new Error("Integration availability should not read private data"); },
    }) });
    const response = await request(app).get("/api/integrations")
      .set("Cookie", "ac-access=test-token").set("x-organization-id", org);
    assert.equal(response.status, 200, role);
    assert.equal(response.body.providers.find(provider => provider.provider === "resend").configured, true);
    assert.equal(JSON.stringify(response.body).includes("private-test-secret"), false);
    assert.ok(response.body.providers.every(provider => Object.keys(provider).every(key => ["name", "provider", "configured", "source", "keyHint", "metadata", "updatedAt"].includes(key))));
  }
});

test("organization managers can verify, encrypt, save, test and disconnect workspace API keys without exposing secrets", async (t) => {
  const stored = new Map();
  t.mock.method(globalThis, "fetch", async (target) => {
    const url = new URL(target);
    if (url.hostname === "generativelanguage.googleapis.com") {
      return Response.json({ name: "models/gemini-3.1-flash-lite" });
    }
    throw new Error("Unexpected provider call: " + url.href);
  });
  const app = createApp({
    env: { ...env, SUPABASE_SERVICE_ROLE_KEY: "service-role-encryption-secret" },
    clientFactory: () => ({
      auth: { getUser: async () => ({ data: { user: { id: record } } }) },
      rpc: async (name, args) => {
        if (name === "organization_permissions") {
          return {
            data: { read: true, write: true, approve: true, manage: true },
          };
        }
        if (name === "save_organization_integration_secret") {
          stored.set(args.provider_name, {
            provider: args.provider_name,
            ciphertext: args.secret_ciphertext,
            iv: args.secret_iv,
            auth_tag: args.secret_tag,
            key_hint: args.masked_hint,
            metadata: args.public_metadata,
            updated_at: "2026-11-22T17:50:00Z",
          });
          return { data: null, error: null };
        }
        if (name === "get_organization_integration_secrets") {
          return { data: [...stored.values()], error: null };
        }
        if (name === "delete_organization_integration_secret") {
          stored.delete(args.provider_name);
          return { data: null, error: null };
        }
        throw new Error("Unexpected RPC " + name);
      },
    }),
  });

  const secretKey = "AIzaSyTestSecretKeyForWorkspace987654";
  const connectRes = await request(app)
    .post("/api/integrations/gemini")
    .set("Origin", env.APP_URL)
    .set("Cookie", "ac-access=test-token")
    .set("x-organization-id", org)
    .send({ apiKey: secretKey, model: "gemini-3.1-flash-lite" });
  assert.equal(connectRes.status, 200, connectRes.body.error);
  assert.equal(connectRes.body.verified, true);
  assert.equal(connectRes.body.keyHint, "AIza••••7654");
  assert.equal(JSON.stringify(connectRes.body).includes(secretKey), false);
  assert.equal(stored.get("gemini").ciphertext.includes(secretKey), false);

  const listRes = await request(app)
    .get("/api/integrations")
    .set("Cookie", "ac-access=test-token")
    .set("x-organization-id", org);
  assert.equal(listRes.status, 200);
  const gemini = listRes.body.providers.find((p) => p.provider === "gemini");
  assert.equal(gemini.configured, true);
  assert.equal(gemini.source, "workspace");
  assert.equal(gemini.keyHint, "AIza••••7654");
  assert.equal(JSON.stringify(listRes.body).includes(secretKey), false);

  const testSavedRes = await request(app)
    .post("/api/integrations/gemini/test")
    .set("Origin", env.APP_URL)
    .set("Cookie", "ac-access=test-token")
    .set("x-organization-id", org)
    .send({});
  assert.equal(testSavedRes.status, 200);
  assert.equal(testSavedRes.body.verified, true);

  const deleteRes = await request(app)
    .delete("/api/integrations/gemini")
    .set("Origin", env.APP_URL)
    .set("Cookie", "ac-access=test-token")
    .set("x-organization-id", org)
    .send({});
  assert.equal(deleteRes.status, 200);
  assert.equal(stored.has("gemini"), false);
});
