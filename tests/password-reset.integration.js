import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const base = process.env.AUTH_TEST_URL || "http://127.0.0.1:5173";
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const email = `acquire-qa-${Date.now()}-reset@example.com`;
const oldPassword = randomBytes(4).toString("hex").slice(0, 6);
const newPassword = randomBytes(4).toString("hex").slice(0, 6);
let user, browser;
const ok = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
try {
  user = ok(
    await admin.auth.admin.createUser({
      email,
      password: oldPassword,
      email_confirm: true,
      user_metadata: { full_name: "Password Reset QA" },
    }),
  ).user;
  console.log("PASS live Supabase accepts a six-character password");
  const recovery = ok(
    await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: base + "/reset-password" },
    }),
  );
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.name));
  await page.goto(recovery.properties.action_link).catch(() => {
    throw Error("Could not open the recovery link");
  });
  await page.waitForURL(base + "/reset-password**");
  const submit = page.getByRole("button", {
    name: "Update password",
    exact: true,
  });
  await submit.waitFor();
  await page.waitForFunction(
    () =>
      !document.querySelector('button[type="submit"],.authForm button.btn')
        ?.disabled,
  );
  assert.ok(
    !page.url().includes("access_token"),
    "Recovery tokens were not removed from the address bar",
  );
  assert.equal(
    await page
      .getByLabel("New password", { exact: true })
      .getAttribute("minlength"),
    "6",
  );
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await submit.click();
  await page
    .getByText("Password updated. You can return to your workspace.", {
      exact: true,
    })
    .waitFor()
    .catch(async () => {
      const message = await page
        .locator(".liveError")
        .textContent()
        .catch(() => "No error shown");
      throw new Error("Password update failed: " + message);
    });
  console.log(
    "PASS real recovery link establishes a session and saves a six-character password",
  );
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  assert.ok(
    (await client.auth.signInWithPassword({ email, password: oldPassword }))
      .error,
    "Old password still works",
  );
  ok(await client.auth.signInWithPassword({ email, password: newPassword }));
  console.log("PASS new password signs in and old password is rejected");
  const fresh = await browser.newContext();
  const expired = await fresh.newPage();
  await expired.goto(recovery.properties.action_link).catch(() => {
    throw Error("Could not check consumed recovery link");
  });
  await expired.getByRole("alert").waitFor();
  assert.equal(
    await expired
      .getByRole("button", { name: "Update password", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await expired
      .getByRole("link", { name: "Request a new reset link" })
      .count(),
    1,
  );
  console.log(
    "PASS used recovery link cannot update a password and offers a new reset link",
  );
  await expired.goto(base + "/reset-password");
  await expired
    .getByText("Open the reset link in your email to choose a new password.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await expired
      .getByRole("button", { name: "Update password", exact: true })
      .isDisabled(),
    true,
  );
  console.log("PASS reset form rejects a missing recovery session");
  const hashed = ok(
    await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: base + "/auth/callback" },
    }),
  );
  await expired
    .goto(
      base +
        "/auth/callback?type=recovery&token_hash=" +
        encodeURIComponent(hashed.properties.hashed_token),
    )
    .catch(() => {
      throw Error("Could not check token-hash recovery");
    });
  await expired.waitForURL(base + "/reset-password");
  await expired.waitForFunction(
    () => !document.querySelector(".authForm button.btn")?.disabled,
  );
  await expired.getByLabel("New password", { exact: true }).fill(oldPassword);
  await expired
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expired
    .getByText("Password updated. You can return to your workspace.", {
      exact: true,
    })
    .waitFor();
  console.log(
    "PASS token-hash recovery callback reaches reset form and updates password",
  );
  assert.deepEqual(errors, []);
  // generateLink validates the live recovery flow without sending mail or consuming the email quota.
} finally {
  if (browser) await browser.close();
  if (user) {
    const deleted = await admin.auth.admin.deleteUser(user.id);
    if (deleted.error)
      throw new Error("Could not clean up password reset fixture");
  }
}
