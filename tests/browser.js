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
const base = process.env.BROWSER_BASE_URL || "http://127.0.0.1:5173";
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
    hasTouch: true,
    timezoneId: "Africa/Lagos",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/");
  const navigationToggle = page.getByRole("button", {
    name: "Toggle navigation",
  });
  await navigationToggle.tap();
  const publicMenu = page.getByRole("dialog", { name: "Site navigation" });
  await publicMenu.waitFor();
  assert(
    await publicMenu.evaluate((el) =>
      getComputedStyle(el).backdropFilter.includes("20px"),
    ),
    "Mobile menu has no glass blur",
  );
  assert(
    await page.evaluate(() => document.body.style.overflow === "hidden"),
    "Page scroll not locked under menu",
  );
  assert(
    await navigationToggle.evaluate(
      (el) =>
        getComputedStyle(el).webkitTapHighlightColor === "rgba(0, 0, 0, 0)",
    ),
    "Touch tap rectangle remains enabled",
  );
  await page.keyboard.press("Escape");
  await publicMenu.waitFor({ state: "hidden" });
  assert(
    await navigationToggle.evaluate((el) => el === document.activeElement),
    "Menu did not restore trigger focus",
  );
  await navigationToggle.tap();
  await page
    .getByRole("navigation", { name: "Mobile navigation", exact: true })
    .getByRole("link", { name: "Features", exact: false })
    .click();
  await publicMenu.waitFor({ state: "hidden" });
  for (const name of ["Understand", "Discover", "Engage", "Convert"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    assert(
      (await page
        .getByRole("tab", { name, exact: true })
        .getAttribute("aria-selected")) === "true",
      "Workflow tab did not respond",
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base + "/app/dashboard");
  await page.waitForURL("**/login");
  assert(
    !(await page.getByText("Acme Technologies", { exact: true }).count()),
    "Mock account still exposed",
  );
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const passwordInput = page.getByLabel("Password", { exact: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Show password", exact: true }).tap();
  assert(
    (await passwordInput.getAttribute("type")) === "text",
    "Password is not visible after tapping the eye",
  );
  assert(
    (await passwordInput.inputValue()) === password,
    "Password changed when toggled",
  );
  await page.getByRole("button", { name: "Hide password", exact: true }).tap();
  assert(
    (await passwordInput.getAttribute("type")) === "password",
    "Password cannot be hidden again",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
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
  await page.goto(base + "/app/admin");
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
  await page.goto(base + "/app/dashboard");
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
  assert(
    (await page.locator(".appSide").getAttribute("inert")) === null,
    "Open drawer remains inert",
  );
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await page.getByRole("heading", { name: "Contacts", exact: true }).waitFor();
  assert(
    (await page.locator(".appSide").getAttribute("inert")) !== null,
    "Closed drawer is keyboard-focusable",
  );
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  const contactDialog = page.getByRole("dialog");
  assert(
    await contactDialog.evaluate(
      (el) => el.getBoundingClientRect().width <= innerWidth - 24,
    ),
    "Dialog is clipped on mobile",
  );
  await page.keyboard.press("Shift+Tab");
  assert(
    await contactDialog.evaluate((el) => el.contains(document.activeElement)),
    "Dialog focus escaped",
  );
  assert(
    await page
      .getByLabel("Full name", { exact: true })
      .evaluate((el) => parseInt(getComputedStyle(el).fontSize) >= 16),
    "Mobile form text triggers input zoom",
  );
  await page.getByLabel("Full name", { exact: true }).fill("Test Contact");
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page.getByRole("cell", { name: "Test Contact", exact: true }).waitFor();
  await page.screenshot({
    path: out + "/contacts-390x844.png",
    fullPage: true,
  });
  assert(
    !(await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )),
    "Contacts table overflows the mobile page",
  );
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("link", { name: "Team & roles", exact: true }).click();
  await page
    .getByRole("heading", { name: "Team & roles", exact: true })
    .waitFor();
  assert(
    (await page.locator(".appSide").getAttribute("inert")) !== null,
    "Manage menu links do not close drawer",
  );
  await page.goto(base + "/app/admin");
  await page
    .getByRole("heading", { name: "Platform owner", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Manage organization", exact: false })
    .first()
    .waitFor();
  assert(
    !(await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )),
    "Platform owner console overflows on mobile",
  );
  await page.screenshot({ path: out + "/owner-390x844.png", fullPage: true });
  await page
    .getByRole("button", { name: "Search workspace", exact: true })
    .click();
  const searchDialog = page.getByRole("dialog", {
    name: "Search your workspace",
  });
  await searchDialog.getByRole("searchbox").fill("Test Contact");
  await searchDialog
    .getByRole("link", { name: "Test Contact", exact: true })
    .click();
  await page.getByRole("cell", { name: "Test Contact", exact: true }).waitFor();
  assert(
    new URL(page.url()).searchParams.get("search") === "Test Contact",
    "Search did not open filtered records",
  );
  await page.getByRole("link", { name: "Your account and settings" }).click();
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Browser Profile Updated");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByText("Profile saved.", { exact: true }).waitFor();
  await page.reload();
  assert(
    (await page.getByLabel("Full name", { exact: true }).inputValue()) ===
      "Browser Profile Updated",
    "Profile update did not persist",
  );
  const currentOrg = await page.evaluate(() =>
    localStorage.getItem("acquire.organization"),
  );
  const fixture = await page.request.post(base + "/api/resources/lists", {
    headers: {
      "x-organization-id": currentOrg,
      Origin: base + "",
    },
    data: { name: "Browser working list" },
  });
  assert(fixture.ok(), "List fixture failed: " + fixture.status());
  await page.goto(base + "/app/lists");
  await page
    .getByRole("row")
    .filter({ hasText: "Browser working list" })
    .getByRole("button", { name: "Contacts", exact: true })
    .click();
  const listDialog = page.getByRole("dialog", { name: "List contacts" });
  await listDialog.waitFor();
  await page.screenshot({ path: out + "/list-dialog.png", fullPage: true });
  await listDialog
    .getByText("Loading contacts…", { exact: true })
    .waitFor({ state: "hidden" });
  assert(
    (await listDialog.getByLabel("Contact", { exact: true }).count()) === 1,
    "List editor unavailable: " + (await listDialog.innerText()),
  );
  await listDialog
    .getByLabel("Contact", { exact: true })
    .selectOption({ label: "Test Contact · test@example.com · Unknown" });
  await page.keyboard.press("Control+k");
  assert(
    (await page
      .getByRole("dialog", { name: "Search your workspace" })
      .count()) === 0,
    "Search opened over another modal",
  );
  await listDialog
    .getByLabel("Find a contact", { exact: true })
    .fill("No match");
  assert(
    await listDialog
      .getByRole("button", { name: "Add contact", exact: true })
      .isDisabled(),
    "Filtered-out contact can still be submitted",
  );
  await listDialog.getByLabel("Find a contact", { exact: true }).fill("");
  await listDialog
    .getByLabel("Contact", { exact: true })
    .selectOption({ label: "Test Contact · test@example.com · Unknown" });
  await listDialog
    .getByRole("button", { name: "Add contact", exact: true })
    .click();
  await listDialog.getByText("Test Contact", { exact: true }).waitFor();
  await listDialog.getByRole("button", { name: "Remove", exact: true }).click();
  await listDialog
    .getByText("No contacts added yet.", { exact: true })
    .waitFor();
  await listDialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto(base + "/app/prospects");
  await page.getByText("Research new companies", { exact: true }).click();
  await page
    .getByText("External research needs an Apollo connection.", {
      exact: false,
    })
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(
    () =>
      document.querySelector(".appSide")?.getBoundingClientRect().left === 0,
  );
  await page.locator('.liveState[role="status"]').waitFor({ state: "hidden" });
  await page.screenshot({
    path: out + "/workspace-updated-1440x900.png",
    fullPage: true,
  });
  const roleChanged = await db
    .from("memberships")
    .update({ role: "viewer" })
    .eq("organization_id", currentOrg)
    .eq("user_id", user.id);
  assert(!roleChanged.error, "Viewer fixture update failed");
  await page.reload();
  await page
    .getByRole("heading", { name: "Prospect discovery", exact: true })
    .waitFor();
  assert(
    (await page
      .getByRole("button", { name: "Add prospect", exact: true })
      .count()) === 0,
    "Viewer sees a create action",
  );
  await page.goto(base + "/app/team");
  await page
    .getByRole("heading", { name: "Team & roles", exact: true })
    .waitFor();
  assert(
    (await page
      .getByRole("button", { name: "Create invitation link", exact: true })
      .count()) === 0,
    "Viewer sees invitation management",
  );
  await page.goto(base + "/app/integrations");
  await page.getByText("Prospect enrichment", { exact: true }).waitFor();
  const roleRestored = await db
    .from("memberships")
    .update({ role: "owner" })
    .eq("organization_id", currentOrg)
    .eq("user_id", user.id);
  assert(!roleRestored.error, "Owner fixture restore failed");
  await page.goto(base + "/app/tasks");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  let taskDialog = page.getByRole("dialog");
  await taskDialog
    .getByLabel("Task", { exact: true })
    .fill("Browser assigned follow-up");
  await taskDialog
    .getByLabel("Assigned to", { exact: true })
    .selectOption(user.id);
  await taskDialog
    .getByLabel("Due date", { exact: true })
    .fill("2026-11-10T14:30");
  await taskDialog
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "Browser assigned follow-up" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  taskDialog = page.getByRole("dialog");
  await taskDialog
    .getByLabel("Assigned to", { exact: true })
    .locator('option[value="' + user.id + '"]')
    .waitFor({ state: "attached" });
  assert(
    (await taskDialog.getByLabel("Due date", { exact: true }).inputValue()) ===
      "2026-11-10T14:30",
    "Editing shifted the local task time",
  );
  assert(
    (await taskDialog
      .getByLabel("Assigned to", { exact: true })
      .inputValue()) === user.id,
    "Task assignee did not persist",
  );
  await taskDialog
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await taskDialog.waitFor({ state: "hidden" });
  const persistedTask = await db
    .from("tasks")
    .select("due_at,assigned_to")
    .eq("organization_id", currentOrg)
    .eq("title", "Browser assigned follow-up")
    .single();
  assert(
    !persistedTask.error &&
      new Date(persistedTask.data.due_at).toISOString() ===
        "2026-11-10T13:30:00.000Z",
    "Saving unchanged corrupted the task due time",
  );
  await page.goto(base + "/onboarding/welcome");
  const secondName = "QA organization browser second " + user.id.slice(0, 6);
  await page.getByLabel("Organization name", { exact: true }).fill(secondName);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page.waitForURL("**/app/dashboard");
  await page
    .getByLabel("Organization", { exact: true })
    .getByRole("option", { name: secondName, exact: true })
    .waitFor({ state: "attached" });
  assert(
    (await page
      .getByLabel("Organization", { exact: true })
      .locator("option:checked")
      .innerText()) === secondName,
    "New organization reverted to the old selection",
  );
  console.log(
    "PASS workspace search, saved profile, list membership, viewer controls, connection state and second-organization selection",
  );
  const reduced = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await reduced.goto(base + "/");
  assert(
    (await reduced.locator("video source").count()) === 0,
    "Reduced motion downloads background video",
  );
  await reduced.getByRole("button", { name: "Toggle navigation" }).click();
  await reduced.getByRole("dialog", { name: "Site navigation" }).waitFor();
  assert(
    await reduced
      .getByRole("dialog")
      .evaluate((el) => getComputedStyle(el).transform === "none"),
    "Reduced-motion menu still slides",
  );
  await reduced.close();
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
