import express from "express";
import Stripe from "stripe";
import { Webhook } from "svix";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { industries } from "../shared/research.js";
import { findBusinesses } from "./lead-discovery.js";
import { scanBusinessWebsite } from "./business-website.js";
export function webhookRoutes(app, { env, admin, result, wrap }) {
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json", limit: "1mb" }),
    wrap(async (req, res) => {
      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET)
        return res
          .status(503)
          .json({ error: "Billing webhook is not configured" });
      const stripe = new Stripe(env.STRIPE_SECRET_KEY);
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          req.headers["stripe-signature"],
          env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        return res.status(400).json({ error: "Invalid webhook signature" });
      }
      if (
        [
          "customer.subscription.created",
          "customer.subscription.updated",
          "customer.subscription.deleted",
        ].includes(event.type)
      ) {
        const s = event.data.object,
          org = s.metadata?.organization_id;
        if (!org) return res.json({ received: true, ignored: true });
        const price = s.items.data[0]?.price.id;
        const plan =
          price === env.STRIPE_PRICE_GROWTH
            ? "growth"
            : price === env.STRIPE_PRICE_STARTER
              ? "starter"
              : null;
        if (!plan)
          return res.status(400).json({ error: "Unknown subscription price" });
        const end = s.items.data[0]?.current_period_end || s.current_period_end;
        result(
          await admin().rpc("apply_billing_event", {
            event_key: event.id,
            org,
            customer:
              typeof s.customer === "string" ? s.customer : s.customer.id,
            subscription: s.id,
            plan_name: plan,
            subscription_status: s.status,
            event_created: event.created,
            ends_at: end ? new Date(end * 1000).toISOString() : null,
          }),
        );
      }
      res.json({ received: true });
    }),
  );
  app.post(
    "/api/webhooks/resend",
    express.raw({ type: "application/json", limit: "1mb" }),
    wrap(async (req, res) => {
      if (!env.RESEND_WEBHOOK_SECRET || !env.RESEND_API_KEY)
        return res
          .status(503)
          .json({ error: "Incoming email is not configured" });
      let event;
      try {
        event = new Webhook(env.RESEND_WEBHOOK_SECRET).verify(
          req.body.toString(),
          {
            "svix-id": req.headers["svix-id"],
            "svix-timestamp": req.headers["svix-timestamp"],
            "svix-signature": req.headers["svix-signature"],
          },
        );
      } catch {
        return res.status(400).json({ error: "Invalid webhook signature" });
      }
      if (event.type !== "email.received")
        return res.json({ received: true, ignored: true });
      const recipient = (event.data.to || []).find((to) =>
        /^reply\+[a-f0-9-]{36}@/i.test(to),
      );
      const org = recipient?.match(/^reply\+([a-f0-9-]{36})@/i)?.[1];
      if (!org) return res.json({ received: true, ignored: true });
      const response = await fetch(
        "https://api.resend.com/emails/receiving/" +
          encodeURIComponent(event.data.email_id),
        {
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok)
        return res
          .status(502)
          .json({ error: "Incoming message could not be retrieved" });
      const email = await response.json();
      const sender =
        String(email.from || "").match(/<([^>]+)>/)?.[1] || email.from;
      result(
        await admin().rpc("record_inbound_email", {
          event_key: req.headers["svix-id"],
          org,
          sender_email: sender,
          email_subject: String(email.subject || "").slice(0, 300),
          email_body: String(email.text || "").slice(0, 20000),
          external_id: event.data.email_id,
        }),
      );
      res.json({ received: true });
    }),
  );
}
export function extensionRoutes(
  app,
  { env, origin, admin, result, wrap, auth, organization },
) {
  app.get(
    "/api/documents",
    auth,
    organization("read"),
    wrap(async (req, res) =>
      res.json({
        data: result(
          await req.db
            .from("documents")
            .select("id,name,content_type,size_bytes,created_at")
            .eq("organization_id", req.org)
            .order("created_at", { ascending: false }),
        ),
      }),
    ),
  );
  app.get(
    "/api/documents/:id",
    auth,
    organization("read"),
    wrap(async (req, res) => {
      const row = result(
        await req.db
          .from("documents")
          .select("path")
          .eq("organization_id", req.org)
          .eq("id", z.string().uuid().parse(req.params.id))
          .single(),
      );
      const data = result(
        await req.db.storage
          .from("organization-documents")
          .createSignedUrl(row.path, 60),
      );
      res.json({ url: data.signedUrl });
    }),
  );
  app.post(
    "/api/documents",
    auth,
    organization("write"),
    express.raw({
      type: ["application/pdf", "text/plain", "text/csv"],
      limit: "5mb",
    }),
    wrap(async (req, res) => {
      const name = z.string().min(1).max(200).parse(req.query.name);
      const type = req.headers["content-type"]?.split(";")[0];
      if (
        !["application/pdf", "text/plain", "text/csv"].includes(type) ||
        !Buffer.isBuffer(req.body) ||
        !req.body.length
      )
        return res
          .status(400)
          .json({ error: "Upload a PDF, text or CSV file under 5 MB" });
      if (
        type === "application/pdf" &&
        req.body.subarray(0, 5).toString() !== "%PDF-"
      )
        return res.status(400).json({ error: "The file is not a valid PDF" });
      const path =
        req.org +
        "/" +
        randomUUID() +
        "/" +
        name.replace(/[^a-zA-Z0-9._-]/g, "_");
      result(
        await req.db.storage
          .from("organization-documents")
          .upload(path, req.body, { contentType: type, upsert: false }),
      );
      try {
        const row = result(
          await req.db
            .from("documents")
            .insert({
              organization_id: req.org,
              name,
              path,
              content_type: type,
              size_bytes: req.body.length,
              uploaded_by: req.user.id,
            })
            .select("id")
            .single(),
        );
        res.status(201).json({ data: row });
      } catch (e) {
        await req.db.storage.from("organization-documents").remove([path]);
        throw e;
      }
    }),
  );
  app.post(
    "/api/billing/checkout",
    auth,
    organization("manage"),
    wrap(async (req, res) => {
      const { plan } = z
        .object({ plan: z.enum(["starter", "growth"]) })
        .parse(req.body);
      const price = env["STRIPE_PRICE_" + plan.toUpperCase()];
      if (!env.STRIPE_SECRET_KEY || !price)
        return res.status(503).json({
          error:
            "Subscription billing has not been configured. No charge has been made.",
        });
      const stripe = new Stripe(env.STRIPE_SECRET_KEY);
      const account = result(
        await req.db
          .from("billing_accounts")
          .select("customer_id,subscription_id,status")
          .eq("organization_id", req.org)
          .single(),
      );
      if (
        account.subscription_id &&
        ["active", "trialing", "past_due"].includes(account.status)
      )
        return res.status(409).json({
          error:
            "An existing subscription is already attached. Use the billing portal to manage it.",
        });
      let customer = account.customer_id;
      if (!customer) {
        const c = await stripe.customers.create(
          { email: req.user.email, metadata: { organization_id: req.org } },
          { idempotencyKey: "org-" + req.org },
        );
        customer = c.id;
        result(
          await admin()
            .from("billing_accounts")
            .update({ customer_id: customer })
            .eq("organization_id", req.org),
        );
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        line_items: [{ price, quantity: 1 }],
        subscription_data: { metadata: { organization_id: req.org } },
        metadata: { organization_id: req.org },
        success_url: origin + "/app/billing?checkout=complete",
        cancel_url: origin + "/app/billing?checkout=cancelled",
      });
      res.json({ url: session.url });
    }),
  );
  app.post(
    "/api/billing/portal",
    auth,
    organization("manage"),
    wrap(async (req, res) => {
      if (!env.STRIPE_SECRET_KEY)
        return res.status(503).json({ error: "Billing is not configured" });
      const account = result(
        await req.db
          .from("billing_accounts")
          .select("customer_id")
          .eq("organization_id", req.org)
          .single(),
      );
      if (!account.customer_id)
        return res.status(400).json({ error: "No billing account exists yet" });
      const session = await new Stripe(
        env.STRIPE_SECRET_KEY,
      ).billingPortal.sessions.create({
        customer: account.customer_id,
        return_url: origin + "/app/billing",
      });
      res.json({ url: session.url });
    }),
  );
  const researchLimit = rateLimit({
    windowMs: 60_000,
    limit: 5,
    keyGenerator: (req) => req.user.id,
    handler: (_req, res) =>
      res.status(429).json({
        error: "Please wait a minute before making another research request.",
      }),
  });
  app.post(
    "/api/prospects/public-directory",
    auth,
    organization("write"),
    researchLimit,
    wrap(async (req, res) => {
      const query = z
        .object({
          city: z
            .string()
            .trim()
            .min(2)
            .max(75)
            .regex(/^[\p{L}\p{M}\d .,'’()-]+$/u),
          country: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-Z]{2}$/),
          industry: z.enum(Object.keys(industries)),
        })
        .strict()
        .parse(req.body);
      res.json(await findBusinesses(env, query));
    }),
  );
  app.post(
    "/api/prospects/check-website",
    auth,
    organization("write"),
    researchLimit,
    wrap(async (req, res) => {
      const { website } = z
        .object({ website: z.string().trim().max(500).url() })
        .strict()
        .parse(req.body);
      res.json({ contacts: await scanBusinessWebsite(website) });
    }),
  );
  app.post(
    "/api/prospects/enrich",
    auth,
    organization("write"),
    researchLimit,
    wrap(async (req, res) => {
      const { websites } = z
        .object({
          websites: z
            .array(
              z
                .object({
                  website: z.string().trim().max(500).url(),
                  country: z
                    .string()
                    .regex(/^[A-Z]{2}$/)
                    .optional(),
                })
                .strict(),
            )
            .min(1)
            .max(12),
        })
        .strict()
        .parse(req.body);
      const stop = new AbortController();
      res.on("close", () => stop.abort());
      res.type("application/x-ndjson");
      res.set("X-Accel-Buffering", "no");
      res.flushHeaders();
      let cursor = 0;
      const worker = async () => {
        while (!stop.signal.aborted && cursor < websites.length) {
          const index = cursor++;
          const { website, country } = websites[index];
          let row;
          try {
            const contacts = await scanBusinessWebsite(website, {
              country,
              signal: stop.signal,
            });
            row = { index, contacts };
          } catch (error) {
            row = { index, error: error.message };
          }
          if (!stop.signal.aborted) res.write(JSON.stringify(row) + "\n");
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(4, websites.length) }, worker),
      );
      if (!stop.signal.aborted) res.end();
    }),
  );
  app.post(
    "/api/prospects/discover",
    auth,
    organization("write"),
    wrap(async (req, res) => {
      const { query, page } = z
        .object({
          query: z.string().min(2).max(200),
          page: z.number().int().min(1).max(10).default(1),
        })
        .parse(req.body);
      if (!env.APOLLO_API_KEY)
        return res.status(503).json({
          error:
            "External prospect discovery is not configured. You can add researched companies or import CSV records.",
        });
      const response = await fetch(
        "https://api.apollo.io/api/v1/mixed_companies/search",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.APOLLO_API_KEY,
          },
          body: JSON.stringify({
            q_organization_keyword_tags: [query],
            page,
            per_page: 25,
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok)
        return res.status(502).json({
          error: "The research provider could not complete the search",
        });
      const data = await response.json();
      res.json({
        companies: (data.organizations || []).map((c) => ({
          name: c.name,
          website: c.website_url || null,
          industry: c.industry || null,
          country: c.country || null,
          source_url: c.website_url || null,
        })),
        notice:
          "Review each company before saving. Provider data is not independently verified.",
      });
    }),
  );
}
