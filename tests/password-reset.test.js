import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app.js";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test",
  APP_URL: "https://inem-acquire.vercel.app",
};
const session = {
  access_token: "access-token-for-reset",
  refresh_token: "refresh-token-for-reset",
  expires_in: 3600,
};
const post = (app, path, body) =>
  request(app).post(`/api/auth/${path}`).set("Origin", env.APP_URL).send(body);

test("signup and login accept six characters and reject five", async () => {
  const calls = [];
  const auth = {
    signUp: async (body) => {
      calls.push(body);
      return { data: { user: { id: "qa", email: body.email }, session: null } };
    },
    signInWithPassword: async (body) => {
      calls.push(body);
      return { data: { user: { id: "qa", email: body.email }, session } };
    },
  };
  const app = createApp({ env, clientFactory: () => ({ auth }) });
  for (const path of ["signup", "login"]) {
    assert.equal(
      (await post(app, path, { email: "qa@example.com", password: "abcde" }))
        .status,
      400,
    );
    assert.equal(
      (await post(app, path, { email: "qa@example.com", password: "abcdef" }))
        .status,
      path === "signup" ? 201 : 200,
    );
  }
  assert.equal(calls.length, 2);
});

test("auth reports email delivery limits and unconfirmed accounts clearly", async () => {
  let failure = { code: "email_address_not_authorized", status: 400 };
  const app = createApp({
    env,
    clientFactory: () => ({
      auth: {
        signUp: async () => ({ error: failure }),
        signInWithPassword: async () => ({ error: failure }),
      },
    }),
  });
  const body = { email: "QA@example.com", password: "abcdef" };
  const unavailable = await post(app, "signup", body);
  assert.equal(unavailable.status, 503);
  assert.match(unavailable.body.error, /verification email/);
  failure = { code: "over_email_send_rate_limit", status: 429 };
  assert.equal((await post(app, "signup", body)).status, 429);
  failure = { code: "email_not_confirmed", status: 400 };
  const unconfirmed = await post(app, "login", body);
  assert.equal(unconfirmed.status, 403);
  assert.equal(unconfirmed.body.code, "email_not_confirmed");
  failure = { code: "invalid_credentials", status: 400 };
  assert.equal((await post(app, "login", body)).status, 401);
});

test("confirmation resend normalizes the address and uses the app callback", async () => {
  let calls = 0;
  const app = createApp({
    env,
    clientFactory: () => ({
      auth: {
        resend: async (payload) => {
          calls++;
          assert.deepEqual(payload, {
            type: "signup",
            email: "qa@example.com",
            options: { emailRedirectTo: env.APP_URL + "/auth/callback" },
          });
          return { data: {}, error: null };
        },
      },
    }),
  });
  const response = await post(app, "resend-verification", {
    email: "  QA@EXAMPLE.COM ",
  });
  assert.equal(response.status, 200);
  assert.match(response.body.message, /If this account needs confirmation/);
  assert.equal(calls, 1);
});

test("reset email uses the production return URL and surfaces delivery failure", async () => {
  let failure = null;
  const app = createApp({
    env,
    clientFactory: () => ({
      auth: {
        resetPasswordForEmail: async (email, options) => {
          assert.equal(email, "qa@example.com");
          assert.equal(options.redirectTo, env.APP_URL + "/reset-password");
          return { error: failure };
        },
      },
    }),
  });
  const success = await post(app, "forgot-password", {
    email: "qa@example.com",
  });
  assert.equal(success.status, 200);
  assert.match(success.body.message, /If an account exists/);
  failure = { status: 429, message: "provider detail" };
  const limited = await post(app, "forgot-password", {
    email: "qa@example.com",
  });
  assert.equal(limited.status, 429);
  assert.ok(!JSON.stringify(limited.body).includes("provider detail"));
  failure = { status: 500 };
  assert.equal(
    (await post(app, "forgot-password", { email: "qa@example.com" })).status,
    503,
  );
});

test("recovery exchange creates HttpOnly cookies and rejects expired links", async () => {
  let valid = true;
  const app = createApp({
    env,
    clientFactory: () => ({
      auth: {
        verifyOtp: async (body) => {
          assert.equal(body.type, "recovery");
          return valid ? { data: { session } } : { error: {}, data: {} };
        },
      },
    }),
  });
  const success = await post(app, "exchange", {
    token_hash: "qa-token-hash",
    type: "recovery",
  });
  assert.equal(success.status, 200);
  assert.ok(success.headers["set-cookie"].every((c) => c.includes("HttpOnly")));
  valid = false;
  assert.equal(
    (
      await post(app, "exchange", {
        token_hash: "qa-token-hash",
        type: "recovery",
      })
    ).status,
    400,
  );
});

test("password update restores the validated session before updating and refreshes cookies", async () => {
  let restored = false,
    updates = 0;
  const app = createApp({
    env,
    clientFactory: () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: "qa" } } }),
        setSession: async (tokens) => {
          assert.deepEqual(tokens, {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
          restored = true;
          return { data: { session } };
        },
        updateUser: async (body) => {
          assert.equal(restored, true);
          assert.equal(body.password, "abcdef");
          updates++;
          return { data: { user: { id: "qa" } } };
        },
      },
    }),
  });
  const cookie = `ac-access=${session.access_token}; ac-refresh=${session.refresh_token}`;
  assert.equal(
    (await post(app, "password", { password: "abcde" }).set("Cookie", cookie))
      .status,
    400,
  );
  const success = await post(app, "password", { password: "abcdef" }).set(
    "Cookie",
    cookie,
  );
  assert.equal(success.status, 200);
  assert.equal(updates, 1);
  assert.ok(success.headers["set-cookie"].every((c) => c.includes("HttpOnly")));
  assert.equal(
    (await post(app, "password", { password: "abcdef" })).status,
    401,
  );
});

test("password update uses rotated refresh token after an expired access token", async () => {
  const rotated = {
    ...session,
    access_token: "new-access-token",
    refresh_token: "new-refresh-token",
  };
  const app = createApp({
    env,
    clientFactory: () => ({
      auth: {
        getUser: async () => ({ error: {} }),
        refreshSession: async () => ({
          data: { user: { id: "qa" }, session: rotated },
        }),
        setSession: async (tokens) => {
          assert.equal(tokens.refresh_token, rotated.refresh_token);
          return { data: { session: rotated } };
        },
        updateUser: async () => ({ data: { user: { id: "qa" } } }),
      },
    }),
  });
  const r = await post(app, "password", { password: "abcdef" }).set(
    "Cookie",
    `ac-access=expired; ac-refresh=${session.refresh_token}`,
  );
  assert.equal(r.status, 200);
});
