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
    assert.equal(response.body.providers[0].configured, true);
    assert.equal(JSON.stringify(response.body).includes("private-test-secret"), false);
    assert.ok(response.body.providers.every(provider => Object.keys(provider).every(key => ["name", "provider", "configured"].includes(key))));
  }
});
