import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  ),
  out = "work/qa-backend";
await fs.mkdir(out, { recursive: true });
const email = `acquire-qa-${Date.now()}-browser@example.com`,
  password = randomBytes(24).toString("base64url");
let user, browser;
const errors = [];
const assert = (value, msg) => {
  if (!value) throw new Error(msg);
};
try {
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Browser Tester" },
  });
  if (created.error) throw created.error;
  user = created.data.user;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/app/dashboard");
  await page.waitForURL("**/login");
  assert(
    !(await page.getByText("Acme Technologies", { exact: true }).count()),
    "Mock account still exposed",
  );
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/onboarding/welcome");
  await page
    .getByLabel("Organization name", { exact: true })
    .fill("QA organization browser " + user.id.slice(0, 6));
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page.waitForURL("**/app/dashboard");
  await page
    .getByRole("heading", { name: "Your acquisition overview" })
    .waitFor();
  const cookies = await page.context().cookies();
  assert(
    cookies.filter((c) => c.name.startsWith("ac-")).every((c) => c.httpOnly),
    "Session cookies not HttpOnly",
  );
  assert(
    !(await page.evaluate(() => Object.keys(localStorage))).some((k) =>
      /token|auth/i.test(k),
    ),
    "Browser persisted a token",
  );
  await page.getByRole("link", { name: "Offers", exact: true }).click();
  await page.getByRole("button", { name: "Add offer", exact: true }).click();
  await page.getByLabel("Offer name", { exact: true }).fill("Managed growth");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Real offer saved by browser test");
  await page.getByLabel("Price", { exact: true }).fill("10000");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page
    .getByRole("cell", { name: "Managed growth", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("cell", { name: "Managed growth", exact: true })
    .waitFor();
  console.log(
    "PASS browser creates a real organization and persists an offer across reload",
  );
  await page.getByRole("link", { name: "Diagnosis", exact: true }).click();
  await page
    .getByRole("button", { name: "Run diagnosis", exact: true })
    .click();
  await page.getByText("Latest diagnosis", { exact: false }).waitFor();
  await page.screenshot({
    path: out + "/diagnosis-1440x900.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Team & roles", exact: true }).click();
  await page
    .getByRole("heading", { name: "Team & roles", exact: true })
    .waitFor();
  assert(
    (await page.getByText("Browser Tester", { exact: true }).count()) >= 1,
    "Profile is missing",
  );
  await page.goto("http://127.0.0.1:5173/app/admin");
  await page
    .getByRole("heading", { name: "Platform owner access required" })
    .waitFor();
  console.log(
    "PASS ordinary organization owner cannot open the platform-owner console",
  );
  await db
    .from("platform_roles")
    .insert({ user_id: user.id, role: "platform_owner" });
  await page.reload();
  await page
    .getByRole("heading", { name: "Platform owner", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Manage organization", exact: false })
    .first()
    .waitFor();
  await page.screenshot({ path: out + "/owner-1440x900.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:5173/app/dashboard");
  await page
    .getByRole("heading", { name: "Your acquisition overview" })
    .waitFor();
  await page.locator(".stats").waitFor();
  await page.screenshot({
    path: out + "/dashboard-390x844.png",
    fullPage: true,
  });
  assert(
    !(await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )),
    "Mobile page overflows",
  );
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await page.getByRole("heading", { name: "Contacts", exact: true }).waitFor();
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Test Contact");
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page.getByRole("cell", { name: "Test Contact", exact: true }).waitFor();
  await page.screenshot({
    path: out + "/contacts-390x844.png",
    fullPage: true,
  });
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),"Contacts table overflows the mobile page");
  assert(errors.length === 0, errors.join("\n"));
  console.log(
    "PASS desktop/mobile, real sign-in, persistence, roles and browser session handling",
  );
  await fs.writeFile(
    out + "/checks.json",
    JSON.stringify(
      { passed: true, errors, viewports: ["1440x900", "390x844"] },
      null,
      2,
    ),
  );
} finally {
  if (browser) await browser.close();
  if (user) {
    const { data: orgs } = await db
      .from("organizations")
      .select("id,name")
      .eq("created_by", user.id);
    for (const org of orgs || []) {
      if (!org.name.startsWith("QA organization browser "))
        throw new Error("Unexpected fixture");
      await db.from("support_sessions").delete().eq("organization_id", org.id);
      const removed = await db.from("organizations").delete().eq("id", org.id);
      if (removed.error) console.error(removed.error.message);
      await db.from("audit_events").delete().eq("organization_id", org.id);
    }
    await db.auth.admin.deleteUser(user.id);
  }
}
