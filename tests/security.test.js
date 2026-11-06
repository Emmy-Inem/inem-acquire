import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app.js";
import { parseResource, canRole } from "../shared/resources.js";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-key",
  APP_URL: "http://127.0.0.1:5173",
};
test("roles deny viewer writes and member approvals", () => {
  assert.equal(canRole("viewer", "read"), true);
  assert.equal(canRole("viewer", "write"), false);
  assert.equal(canRole("member", "approve"), false);
  assert.equal(canRole("manager", "approve"), true);
  assert.equal(canRole("platform_owner", "manage"), false);
});
test("resource schemas reject tenant, approval and ownership injection", () => {
  assert.throws(() =>
    parseResource("offers", { name: "Offer", organization_id: "attacker" }),
  );
  assert.throws(() =>
    parseResource("campaigns", {
      name: "Campaign",
      status: "approved",
      approved_by: "attacker",
    }),
  );
  assert.throws(() => parseResource("memberships", { role: "owner" }));
  assert.throws(() =>
    parseResource("prospects", {
      name: "Example",
      website: "javascript:alert(1)",
    }),
  );
  assert.throws(() => parseResource("deals", { title: "Deal", value: -1 }));
  assert.deepEqual(parseResource("tasks", { status: "done" }, true), {
    status: "done",
  });
});
test("protected APIs require a session", async () => {
  const app = createApp({ env });
  const r = await request(app).get("/api/bootstrap");
  assert.equal(r.status, 401);
  assert.match(r.headers["set-cookie"][0], /HttpOnly/);
});
test("cross-origin login and writes are rejected before touching authentication", async () => {
  let calls = 0;
  const app = createApp({
    env,
    clientFactory: () => {
      calls++;
      throw new Error("Should not run");
    },
  });
  const r = await request(app)
    .post("/api/auth/login")
    .set("Origin", "https://attacker.example")
    .send({ email: "a@example.com", password: "long-password" });
  assert.equal(r.status, 403);
  assert.equal(calls, 0);
});
test("invalid signup is rejected without exposing internals", async () => {
  const app = createApp({ env });
  const r = await request(app)
    .post("/api/auth/signup")
    .set("Origin", env.APP_URL)
    .send({ email: "invalid", password: "short" });
  assert.equal(r.status, 400);
  assert.ok(r.body.error);
  assert.equal(r.body.stack, undefined);
});
test("public health never returns secret material", async () => {
  const app = createApp({
    env: { ...env, SUPABASE_SERVICE_ROLE_KEY: "do-not-expose" },
  });
  const r = await request(app).get("/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.configured, true);
  assert.ok(!JSON.stringify(r.body).includes("do-not-expose"));
});
test("an unconfigured backend reports an actionable failure", async () => {
  const app = createApp({ env: {} });
  const r = await request(app).get("/api/bootstrap");
  assert.equal(r.status, 503);
  assert.match(r.body.error, /not configured/);
});
