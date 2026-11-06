import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import Stripe from "stripe";
import { createApp } from "../server/app.js";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  APP_URL: "http://127.0.0.1:5173",
  STRIPE_SECRET_KEY: "sk_test_fixture",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  STRIPE_PRICE_GROWTH: "price_growth_fixture",
};
test("Stripe webhook rejects forged signatures before touching billing records", async () => {
  let calls = 0;
  const app = createApp({
    env,
    clientFactory: () => {
      calls++;
      throw new Error("Unexpected database call");
    },
  });
  const r = await request(app)
    .post("/api/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set("stripe-signature", "forged")
    .send("{}");
  assert.equal(r.status, 400);
  assert.equal(calls, 0);
});
test("a valid signed subscription event is applied through the transactional RPC", async () => {
  let rpc, args;
  const app = createApp({
    env,
    clientFactory: () => ({
      rpc: async (name, input) => {
        rpc = name;
        args = input;
        return { data: true, error: null };
      },
    }),
  });
  const payload = JSON.stringify({
    id: "evt_fixture",
    created: 1000,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_fixture",
        customer: "cus_fixture",
        status: "active",
        metadata: { organization_id: "00000000-0000-4000-8000-000000000001" },
        items: {
          data: [
            {
              price: { id: env.STRIPE_PRICE_GROWTH },
              current_period_end: 2000,
            },
          ],
        },
      },
    },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: env.STRIPE_WEBHOOK_SECRET,
  });
  const r = await request(app)
    .post("/api/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(payload);
  assert.equal(r.status, 200);
  assert.equal(rpc, "apply_billing_event");
  assert.equal(args.event_key, "evt_fixture");
  assert.equal(args.plan_name, "growth");
  assert.equal(args.subscription_status, "active");
});
test("an unconfigured inbox webhook cannot ingest unsigned messages", async () => {
  const app = createApp({ env });
  const r = await request(app)
    .post("/api/webhooks/resend")
    .set("Content-Type", "application/json")
    .send("{}");
  assert.equal(r.status, 503);
});
