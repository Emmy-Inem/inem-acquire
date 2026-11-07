import { companyAssetRoutes } from "./company-assets.js";
import { answerSalesQuestion } from "./sales-advisor.js";
import { platformOrganizationRoutes } from "./platform-organizations.js";
import { suggestedNextSteps } from "./gemini.js";
import { webhookRoutes, extensionRoutes } from "./extensions.js";
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true, quiet: true });
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { readResources, parseResource, canRole } from "../shared/resources.js";

export function createApp({
  env = process.env,
  clientFactory = createClient,
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (env.VERCEL) app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  const url = env.SUPABASE_URL,
    key = env.SUPABASE_ANON_KEY;
  const origin = env.APP_URL || "http://127.0.0.1:5173";
  const production = env.NODE_ENV === "production";
  const cookies = {
    access: production ? "__Host-ac-access" : "ac-access",
    refresh: production ? "__Host-ac-refresh" : "ac-refresh",
  };
  const makeClient = (jwt, supportId) =>
    clientFactory(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      ...(jwt
        ? {
            global: {
              headers: {
                Authorization: `Bearer ${jwt}`,
                ...(supportId ? { "x-support-session-id": supportId } : {}),
              },
            },
          }
        : {}),
    });
  const admin = () => {
    if (!env.SUPABASE_SERVICE_ROLE_KEY)
      throw Object.assign(
        new Error("Server administration is not configured"),
        { status: 503 },
      );
    return clientFactory(url, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  };
  const configured = () => {
    if (!url || !key)
      throw Object.assign(new Error("Supabase connection is not configured"), {
        status: 503,
      });
  };
  const cookieValue = (req, name) => {
    const pair = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="));
    try {
      return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
    } catch {
      return null;
    }
  };
  const setSession = (res, s) => {
    res.cookie(cookies.access, s.access_token, {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
      maxAge: (s.expires_in || 3600) * 1000,
    });
    res.cookie(cookies.refresh, s.refresh_token, {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 86400000,
    });
  };
  const clearSession = (res) => {
    for (const name of Object.values(cookies))
      res.clearCookie(name, {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        path: "/",
      });
  };
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
  const result = (r) => {
    if (r.error)
      throw Object.assign(new Error(r.error.code === "P0001" && /^(Starter includes|Your plan has|An active invitation)/.test(r.error.message||"") ? r.error.message : "The request could not be completed"), {
        status: r.error.code === "42501" ? 403 : 400,
      });
    return r.data;
  };
  const uuid = z.string().uuid();
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !req.path.startsWith("/webhooks/")
    ) {
      const allowed = [
        origin,
        ...(env.ADDITIONAL_ORIGINS || "").split(",").filter(Boolean),
      ];
      if (!allowed.includes(req.headers.origin))
        return res
          .status(403)
          .json({ error: "This request must come from the application" });
    }
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, configured: !!(url && key) }),
  );
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 25,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({
          error:
            "Too many sign-in attempts. Please wait a few minutes and try again.",
          code: "auth_rate_limited",
        }),
    }),
  );
  webhookRoutes(app, { env, admin, result, wrap });
  app.use(express.json({ limit: "1mb" }));
  const credentials = z
    .object({
      email: z.string().trim().toLowerCase().email().max(254),
      password: z.string().min(6).max(128),
      full_name: z.string().trim().min(2).max(120).optional(),
    })
    .strict();
  const authFailure = (res, error, action) => {
    if (
      error.status === 429 ||
      ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
        error.code,
      )
    )
      return res.status(429).json({
        code: "auth_rate_limited",
        error:
          "Too many attempts. Please wait a few minutes before trying again.",
      });
    if (
      [
        "email_address_not_authorized",
        "email_provider_disabled",
        "smtp_send_failed",
      ].includes(error.code) ||
      error.status >= 500
    )
      return res.status(503).json({
        code: "auth_service_unavailable",
        error:
          action === "login"
            ? "Sign-in is temporarily unavailable. Please try again shortly."
            : "We could not send your verification email. Please try again shortly or contact support.",
      });
    if (error.code === "email_not_confirmed")
      return res.status(403).json({
        code: "email_not_confirmed",
        error:
          "Confirm your email address before signing in. Check your inbox or request a new confirmation link below.",
      });
    return res.status(action === "login" ? 401 : 400).json({
      code: action === "login" ? "invalid_credentials" : "signup_failed",
      error:
        action === "login"
          ? "Email or password is incorrect."
          : error.code === "weak_password"
            ? "Use a password with at least 6 characters."
            : "Unable to create account. Check your details, or try signing in if you already registered.",
    });
  };
  app.post(
    "/api/auth/signup",
    wrap(async (req, res) => {
      configured();
      const data = credentials.parse(req.body);
      const { data: auth, error } = await makeClient().auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { full_name: data.full_name || "" },
          emailRedirectTo: origin + "/auth/callback",
        },
      });
      if (error) return authFailure(res, error, "signup");
      if (auth.session) setSession(res, auth.session);
      res.status(201).json({
        user: auth.user ? { id: auth.user.id, email: auth.user.email } : null,
        needsVerification: !auth.session,
      });
    }),
  );
  app.post(
    "/api/auth/login",
    wrap(async (req, res) => {
      configured();
      const data = credentials.omit({ full_name: true }).parse(req.body);
      const { data: auth, error } =
        await makeClient().auth.signInWithPassword(data);
      if (error || !auth.session) return authFailure(res, error || {}, "login");
      setSession(res, auth.session);
      res.json({ user: { id: auth.user.id, email: auth.user.email } });
    }),
  );
  app.post(
    "/api/auth/resend-verification",
    wrap(async (req, res) => {
      configured();
      const { email } = credentials.pick({ email: true }).parse(req.body);
      const { error } = await makeClient().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: origin + "/auth/callback" },
      });
      if (error) return authFailure(res, error, "signup");
      res.json({
        success: true,
        message:
          "If this account needs confirmation, a new verification link has been sent.",
      });
    }),
  );
  app.post(
    "/api/auth/logout",
    wrap(async (req, res) => {
      const token = cookieValue(req, cookies.access);
      if (token) {
        const db = makeClient(token);
        await db.auth.setSession({
          access_token: token,
          refresh_token: cookieValue(req, cookies.refresh) || "",
        });
        await db.auth.signOut({ scope: "local" });
      }
      clearSession(res);
      res.json({ success: true });
    }),
  );
  app.post(
    "/api/auth/forgot-password",
    wrap(async (req, res) => {
      configured();
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const { error } = await makeClient().auth.resetPasswordForEmail(email, {
        redirectTo: origin + "/reset-password",
      });
      if (error)
        return res.status(error.status === 429 ? 429 : 503).json({
          error:
            error.status === 429
              ? "Please wait a few minutes before requesting another reset link."
              : "We could not send a reset link right now. Please try again shortly.",
        });
      res.json({
        success: true,
        message: "If an account exists, a reset link will be sent.",
      });
    }),
  );
  app.post(
    "/api/auth/exchange",
    wrap(async (req, res) => {
      configured();
      const body = z
        .object({
          token_hash: z.string().min(10),
          type: z.enum([
            "email",
            "signup",
            "recovery",
            "invite",
            "magiclink",
            "email_change",
          ]),
        })
        .parse(req.body);
      const { data, error } = await makeClient().auth.verifyOtp(body);
      if (error || !data.session)
        return res
          .status(400)
          .json({ error: "This link has expired or has already been used." });
      setSession(res, data.session);
      res.json({ success: true, type: body.type });
    }),
  );
  // Supabase's hosted confirmation pages return session tokens in a URL fragment. The browser transfers them once into HttpOnly cookies.
  app.post(
    "/api/auth/session",
    wrap(async (req, res) => {
      configured();
      const body = z
        .object({
          access_token: z.string().min(20).max(8192),
          refresh_token: z.string().min(10).max(8192),
        })
        .strict()
        .parse(req.body);
      const db = makeClient();
      const { data, error } = await db.auth.setSession(body);
      if (error || !data.session)
        return res.status(401).json({ error: "Invalid sign-in link" });
      setSession(res, data.session);
      res.json({ success: true });
    }),
  );
  const auth = wrap(async (req, res, next) => {
    configured();
    let token = cookieValue(req, cookies.access);
    let refreshToken = cookieValue(req, cookies.refresh);
    let db = makeClient(token);
    let response = token ? await db.auth.getUser(token) : { error: true };
    if (response.error) {
      const refresh = refreshToken;
      if (!refresh) {
        clearSession(res);
        return res.status(401).json({ error: "Sign in to continue" });
      }
      const rotated = await makeClient().auth.refreshSession({
        refresh_token: refresh,
      });
      if (rotated.error || !rotated.data.session) {
        clearSession(res);
        return res
          .status(401)
          .json({ error: "Your session expired. Please sign in again." });
      }
      setSession(res, rotated.data.session);
      token = rotated.data.session.access_token;
      refreshToken = rotated.data.session.refresh_token;
      db = makeClient(token);
      response = { data: { user: rotated.data.user } };
    }
    req.user = response.data.user;
    req.db = db;
    req.jwt = token;
    req.refreshToken = refreshToken;
    next();
  });
  const organization = (capability) =>
    wrap(async (req, res, next) => {
      const org = uuid.parse(req.headers["x-organization-id"]);
      const supportId = uuid.optional().parse(req.headers["x-support-session-id"]);
      if (supportId) req.db = makeClient(req.jwt, supportId);
      req.supportId = supportId;
      const permissions = result(
        await req.db.rpc("organization_permissions", { org }),
      );
      if (!permissions?.[capability])
        return res.status(403).json({
          error: "Your role does not allow this action in this organization",
        });
      req.org = org;
      req.permissions = permissions;
      next();
    });
  companyAssetRoutes(app, {auth, organization, wrap, result});
  const edge = async (req, name, payload) => {
    const response = await fetch(`${url}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${req.jwt}`,
        ...(req.supportId ? { "x-support-session-id": req.supportId } : {}),
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw Object.assign(new Error("The server action is unavailable"), {
        status: 502,
      });
    }
    if (!response.ok)
      throw Object.assign(new Error(data.error || "The server action failed"), {
        status: response.status,
      });
    return data;
  };
  app.get(
    "/api/bootstrap",
    auth,
    wrap(async (req, res) => {
      const [profile, memberships, roles] = await Promise.all([
        req.db
          .from("profiles")
          .select("id,full_name")
          .eq("id", req.user.id)
          .single(),
        req.db
          .from("memberships")
          .select("organization_id,role,organizations(*)")
          .eq("user_id", req.user.id),
        req.db.from("platform_roles").select("role").eq("user_id", req.user.id),
      ]);
      const platformOwner = result(roles).some((r) => r.role === "platform_owner");
      const supportSessions = platformOwner
        ? result(await admin()
            .from("support_sessions")
            .select("id,organization_id,expires_at,reason,organizations(id,name,industry,website,description)")
            .eq("user_id", req.user.id)
            .is("ended_at", null)
            .gt("expires_at", new Date().toISOString()))
        : [];
      res.json({
        user: { id: req.user.id, email: req.user.email },
        profile: result(profile),
        memberships: result(memberships),
        platformOwner,
        supportSessions,
      });
    }),
  );
  app.patch(
    "/api/profile",
    auth,
    wrap(async (req, res) => {
      const values = z
        .object({ full_name: z.string().trim().min(2).max(120) })
        .strict()
        .parse(req.body);
      const profile = result(
        await req.db
          .from("profiles")
          .update(values)
          .eq("id", req.user.id)
          .select("id,full_name")
          .single(),
      );
      res.json({ profile });
    }),
  );
  app.post(
    "/api/auth/password",
    auth,
    wrap(async (req, res) => {
      const { password } = z
        .object({ password: z.string().min(6).max(128) })
        .parse(req.body);
      const db = makeClient();
      const { data: restored, error: sessionError } = await db.auth.setSession({
        access_token: req.jwt,
        refresh_token: req.refreshToken || "",
      });
      if (sessionError || !restored.session)
        return res.status(401).json({
          error: "Your reset session expired. Request a new reset link.",
        });
      const { error } = await db.auth.updateUser({ password });
      if (error)
        return res.status(400).json({
          error:
            error.code === "same_password"
              ? "Choose a different password from your current one."
              : "Password could not be updated. Use at least 6 characters and try again.",
        });
      setSession(res, restored.session);
      res.json({ success: true });
    }),
  );
  app.post(
    "/api/organizations",
    auth,
    wrap(async (req, res) => {
      const data = z
        .object({
          name: z.string().trim().min(2).max(120),
          website: z.string().url().nullable().optional(),
          industry: z.string().max(120).nullable().optional(),
        })
        .strict()
        .parse(req.body);
      const id = result(
        await req.db.rpc("create_organization", {
          org_name: data.name,
          org_website: data.website || null,
          org_industry: data.industry || null,
        }),
      );
      res.status(201).json({ id });
    }),
  );
  app.patch(
    "/api/organization",
    auth,
    organization("manage"),
    wrap(async (req, res) => {
      const data = z
        .object({
          name: z.string().min(2).max(120).optional(),
          website: z.string().url().nullable().optional(),
          industry: z.string().max(120).optional(),
          description: z.string().max(5000).optional(),
        })
        .strict()
        .parse(req.body);
      res.json({
        data: result(
          await req.db
            .from("organizations")
            .update(data)
            .eq("id", req.org)
            .select("*")
            .single(),
        ),
      });
    }),
  );
  app.get(
    "/api/organization/permissions",
    auth,
    organization("read"),
    (req, res) => res.json(req.permissions),
  );
  app.get(
    "/api/resources/:resource",
    auth,
    organization("read"),
    wrap(async (req, res) => {
      if (!readResources.includes(req.params.resource))
        return res.status(404).json({ error: "Module not found" });
      res.json(
        await edge(req, "workspace-api", {
          organization_id: req.org,
          resource: req.params.resource,
          action: "list",
          search: req.query.search || undefined,
          offset: Number(req.query.offset || 0),
          limit: Number(req.query.limit || 50),
        }),
      );
    }),
  );
  for (const method of ["post", "patch", "delete"])
    app[method](
      ["/api/resources/:resource", "/api/resources/:resource/:id"],
      auth,
      (req, res, next) =>
        organization(
          method === "delete" && req.params.resource !== "campaign_recipients"
            ? "approve"
            : "write",
        )(req, res, next),
      wrap(async (req, res) => {
        const action = { post: "create", patch: "update", delete: "delete" }[
          method
        ];
        if (action !== "delete")
          parseResource(req.params.resource, req.body, action === "update");
        res.status(action === "create" ? 201 : 200).json(
          await edge(req, "workspace-api", {
            organization_id: req.org,
            resource: req.params.resource,
            action,
            id: req.params.id ? uuid.parse(req.params.id) : undefined,
            data: action === "delete" ? undefined : req.body,
          }),
        );
      }),
    );
  app.get(
    "/api/dashboard",
    auth,
    organization("read"),
    wrap(async (req, res) => {
      const tables = [
        "prospects",
        "contacts",
        "deals",
        "tasks",
        "campaigns",
        "messages",
        "diagnoses",
      ];
      const entries = await Promise.all(
        tables.map(async (table) => [
          table,
          result(
            await req.db
              .from(table)
              .select("*")
              .eq("organization_id", req.org)
              .order("created_at", { ascending: false })
              .limit(1000),
          ),
        ]),
      );
      res.json({
        records: Object.fromEntries(entries),
        scope: "Most recent 1,000 records per module",
      });
    }),
  );
  app.post(
    "/api/diagnosis",
    auth,
    organization("write"),
    wrap(async (req, res) => {
      const diagnosis = await edge(req, "sales-intelligence", {
        organization_id: req.org,
        action: "diagnose",
      });
      const steps = await suggestedNextSteps(
        env,
        diagnosis.data?.findings || [],
      );
      if (steps.length) {
        const evidence = { ...diagnosis.data.evidence, gemini_steps: steps };
        const saved = await admin()
          .from("diagnoses")
          .update({ evidence })
          .eq("organization_id", req.org)
          .eq("id", diagnosis.data.id)
          .select("*")
          .single();
        if (!saved.error && saved.data) diagnosis.data = saved.data;
      }
      res.json(diagnosis);
    }),
  );
  app.post(
    "/api/advisor",
    auth,
    organization("read"),
    wrap(async (req, res) => {
      const input = z.object({question:z.string().trim().min(3).max(2000),document_ids:z.array(z.string().uuid()).max(3).default([]),history:z.array(z.object({question:z.string().max(2000),answer:z.string().max(8000)}).strict()).max(4).default([])}).strict().parse(req.body);
      res.json(await answerSalesQuestion(env, req.db, req.org, input));
    }),
  );
  app.post(
    "/api/campaigns/:id/approve",
    auth,
    organization("approve"),
    wrap(async (req, res) => {
      result(
        await req.db.rpc("approve_campaign", {
          campaign: uuid.parse(req.params.id),
        }),
      );
      res.json({ success: true });
    }),
  );
  app.post(
    "/api/campaigns/:id/send",
    auth,
    organization("approve"),
    wrap(async (req, res) =>
      res.json(
        await edge(req, "campaign-delivery", {
          organization_id: req.org,
          campaign_id: uuid.parse(req.params.id),
        }),
      ),
    ),
  );
  app.get(
    "/api/team",
    auth,
    organization("read"),
    wrap(async (req, res) => {
      const members = result(
        await req.db
          .from("memberships")
          .select("user_id,role,created_at,profiles(full_name)")
          .eq("organization_id", req.org),
      );
      const invitations = req.permissions.manage
        ? result(
            await req.db
              .from("invitations")
              .select("id,email,role,expires_at,accepted_at")
              .eq("organization_id", req.org),
          )
        : [];
      res.json({ members, invitations });
    }),
  );
  app.patch(
    "/api/team/:id",
    auth,
    organization("manage"),
    wrap(async (req, res) => {
      const { role } = z
        .object({ role: z.enum(["admin", "manager", "member", "viewer"]) })
        .parse(req.body);
      result(
        await req.db.rpc("set_member_role", {
          org: req.org,
          target_user: uuid.parse(req.params.id),
          new_role: role,
        }),
      );
      res.json({ success: true });
    }),
  );
  app.post(
    "/api/invitations",
    auth,
    organization("manage"),
    wrap(async (req, res) => {
      const data = z
        .object({
          email: z.string().email(),
          role: z.enum(["admin", "manager", "member", "viewer"]),
        })
        .parse(req.body);
      const membership = result(
        await req.db
          .from("memberships")
          .select("role")
          .eq("organization_id", req.org)
          .eq("user_id", req.user.id)
          .maybeSingle(),
      );
      if (!membership || (data.role === "admin" && membership.role !== "owner"))
        return res.status(403).json({
          error: "Organization owner required to invite administrators",
        });
      const token = randomBytes(32).toString("hex");
      const row = result(await admin().rpc("create_plan_invitation", {org:req.org,address:data.email,member_role:data.role,hash:createHash("sha256").update(token).digest("hex"),actor:req.user.id}));
      await admin().from("audit_events").insert({
        organization_id: req.org,
        actor_id: req.user.id,
        action: "invitation.created",
        entity_id: row.id,
      });
      res.status(201).json({
        invitation: row,
        inviteUrl: origin + "/invite/" + token,
        message:
          "Share this link with the invited teammate. It expires in 7 days.",
      });
    }),
  );
  app.delete("/api/invitations/:id",auth,organization("manage"),wrap(async(req,res)=>{
    const id=uuid.parse(req.params.id);const invitation=result(await req.db.from("invitations").select("role,accepted_at").eq("organization_id",req.org).eq("id",id).single());
    const member=result(await req.db.from("memberships").select("role").eq("organization_id",req.org).eq("user_id",req.user.id).single());
    if(invitation.accepted_at)return res.status(409).json({error:"This invitation has already been accepted."});
    if(invitation.role==="admin"&&member.role!=="owner")return res.status(403).json({error:"Only the owner can revoke an administrator invitation."});
    result(await admin().from("invitations").delete().eq("organization_id",req.org).eq("id",id).is("accepted_at",null));res.json({success:true});
  }));
  app.post(
    "/api/invitations/accept",
    auth,
    wrap(async (req, res) => {
      const { token } = z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(req.body);
      const org = result(
        await req.db.rpc("accept_invitation", {
          invite_hash: createHash("sha256").update(token).digest("hex"),
        }),
      );
      res.json({ organization_id: org });
    }),
  );
  app.use("/api/platform", auth, wrap(async (req, res, next) => {
    const roles = result(await req.db.from("platform_roles").select("role").eq("user_id", req.user.id));
    if (!roles.some((row) => row.role === "platform_owner"))
      return res.status(403).json({ error: "Platform owner access required" });
    next();
  }));
  platformOrganizationRoutes(app, { admin, result, wrap });
  app.post(
    "/api/platform/support",
    wrap(async (req, res) => {
      const data = z
        .object({
          organization_id: uuid,
          reason: z.string().trim().min(10).max(500),
        })
        .parse(req.body);
      const id = result(
        await req.db.rpc("start_support_session", {
          org: data.organization_id,
          support_reason: data.reason,
        }),
      );
      res.json({ id, organization_id: data.organization_id });
    }),
  );
  app.delete(
    "/api/platform/support/:id",
    wrap(async (req, res) => {
      result(
        await req.db.rpc("end_support_session", {
          org: uuid.parse(req.params.id),
        }),
      );
      res.json({ success: true });
    }),
  );
  app.get("/api/integrations", auth, organization("read"), (_req, res) =>
    res.json({
      providers: [
        {
          name: "Gemini assistance",
          provider: "gemini",
          configured: !!env.GEMINI_API_KEY,
        },
        {
          name: "Email delivery",
          provider: "resend",
          configured: !!(env.RESEND_API_KEY && env.OUTBOUND_FROM),
        },
        {
          name: "Prospect enrichment",
          provider: "apollo",
          configured: !!env.APOLLO_API_KEY,
        },
        {
          name: "Subscription billing",
          provider: "stripe",
          configured: !!(
            env.STRIPE_SECRET_KEY &&
            env.STRIPE_PRICE_STARTER &&
            env.STRIPE_PRICE_GROWTH
          ),
        },
      ],
    }),
  );
  app.post(
    "/api/import/prospects",
    auth,
    organization("write"),
    wrap(async (req, res) => {
      const { csv } = z
        .object({ csv: z.string().min(1).max(500000) })
        .parse(req.body);
      let rows;
      try {
        rows = parse(csv, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          max_record_size: 20000,
        });
      } catch {
        return res
          .status(400)
          .json({ error: "CSV could not be read. Include a header row." });
      }
      if (!rows.length || rows.length > 500)
        return res
          .status(400)
          .json({ error: "Import between 1 and 500 companies at a time" });
      const valid = rows.map((row) => ({
        ...parseResource("prospects", {
          name: row.name,
          website: row.website || null,
          industry: row.industry || null,
          country: row.country || null,
          source_url: row.source_url || null,
          notes: row.notes || "",
        }),
        organization_id: req.org,
      }));
      res.json({
        imported: result(
          await req.db.from("prospects").insert(valid).select("id"),
        ).length,
      });
    }),
  );
  app.get(
    "/api/export/:resource",
    auth,
    organization("approve"),
    wrap(async (req, res) => {
      if (
        !["prospects", "contacts", "deals", "tasks"].includes(
          req.params.resource,
        )
      )
        return res.status(404).json({ error: "Export not available" });
      const rows=[];
      for(let offset=0;offset<5000;offset+=1000){
        const batch=result(await req.db.from(req.params.resource).select("*").eq("organization_id",req.org).order("created_at").order("id").range(offset,offset+999));
        rows.push(...batch);if(batch.length<1000)break;
      }
      if (!rows.length)
        return res
          .status(400)
          .json({ error: "There are no records to export" });
      const available=Object.keys(rows[0]);
      const requested=typeof req.query.fields === "string" ? req.query.fields.split(",").map(s=>s.trim()).filter(Boolean) : [];
      if(requested.some(name=>!available.includes(name)))return res.status(400).json({error:"One or more report columns are invalid. Use field names from the selected module."});
      const columns=requested.length?[...new Set(requested)]:available.filter(name=>name!=="organization_id");
      const cell = (v) =>
        '"' +
        String(v ?? "")
          .replace(/^[=+@\-\t\r]/, "'" + "$&")
          .replaceAll('"', '""') +
        '"';
      res
        .type("text/csv")
        .attachment(req.params.resource + ".csv")
        .send(
          [
            columns.map(cell).join(","),
            ...rows.map((row) => columns.map((k) => cell(row[k])).join(",")),
          ].join("\r\n"),
        );
    }),
  );
  app.post(
    "/api/demo",
    rateLimit({ windowMs: 3600000, limit: 5 }),
    wrap(async (req, res) => {
      configured();
      const data = z
        .object({
          name: z.string().min(2).max(120),
          email: z.string().email(),
          company: z.string().min(2).max(200),
          message: z.string().max(5000).default(""),
        })
        .strict()
        .parse(req.body);
      result(await admin().from("demo_requests").insert(data));
      res.status(201).json({ success: true });
    }),
  );
  app.get(
    "/api/platform/demo-requests",
    wrap(async (_req, res) => {
      res.json({
        requests: result(
          await admin()
            .from("demo_requests")
            .select("id,name,email,company,message,created_at")
            .order("created_at", { ascending: false })
            .limit(100),
        ),
      });
    }),
  );
  extensionRoutes(app, {
    env,
    origin,
    admin,
    result,
    wrap,
    auth,
    organization,
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (error instanceof SyntaxError)
      return res.status(400).json({ error: "Invalid request body" });
    console.error("API error:", error.name);
    res.status(error.status || 500).json({
      error: error.status
        ? error.message
        : "Something went wrong. Please try again.",
    });
  });
  return app;
}
export default createApp();
