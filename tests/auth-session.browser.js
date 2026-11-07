import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright";

// Exercise the real provider in React with deliberately reordered responses.
// All network calls are replaced locally; no accounts or live services are used.
const harnessPath = "work/auth-session-test.html";
await fs.mkdir("work", { recursive: true });
await fs.writeFile(harnessPath, `<!doctype html><div id="root"></div>
<script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider,useAuth} from '/src/live/AuthContext.jsx';
window.requests=[];
window.fetch=(url)=>new Promise(resolve=>window.requests.push({url,resolve:(data,status=200)=>resolve(new Response(JSON.stringify(data),{status}))}));
function Probe(){const auth=useAuth();window.auth=auth;return React.createElement('output',null,auth.session?.user?.id||'signed-out')}
createRoot(document.getElementById('root')).render(React.createElement(AuthProvider,null,React.createElement(Probe)));
</script>`);
let server, browser;
try {
  server = await createServer({ server: { host: "127.0.0.1", port: 0, open: false } });
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${harnessPath}`);
  const waitRequests = (count) => page.waitForFunction((n) => window.requests?.length === n, count);
  const resolve = (index, id) => page.evaluate(({index,id}) => window.requests[index].resolve({user:{id},memberships:[],supportSessions:[]}), {index,id});
  await waitRequests(1);
  await resolve(0, "initial");
  await page.waitForFunction(() => window.auth.session?.user.id === "initial");
  await page.evaluate(() => { window.refreshes=[window.auth.refresh(),window.auth.refresh()]; });
  await waitRequests(3);
  await resolve(2, "latest");
  await resolve(1, "stale");
  await page.evaluate(() => Promise.all(window.refreshes));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.waitForFunction(() => window.auth.session?.user.id === "latest");
  assert.equal(await page.locator("output").textContent(), "latest");
  await page.evaluate(() => { window.staleRefresh=window.auth.refresh(); window.logoutPromise=window.auth.logout(); });
  await waitRequests(5);
  await page.evaluate(() => window.auth.refresh());
  assert.equal(await page.evaluate(() => window.requests.length), 5, "Refresh during logout must be suppressed");
  await page.evaluate(() => window.requests[4].resolve({}));
  await page.evaluate(() => window.logoutPromise);
  await resolve(3, "logged-out-user");
  await page.evaluate(() => window.staleRefresh);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.waitForFunction(() => window.auth.session === null);
  assert.equal(await page.locator("output").textContent(), "signed-out");
  // A new login/refresh remains possible after logout has completed.
  await page.evaluate(() => { window.auth.refresh(); });
  await waitRequests(6);
  await resolve(5, "new-login");
  await page.waitForFunction(() => window.auth.session?.user.id === "new-login");
  assert.deepEqual(errors, []);
  console.log("PASS: latest bootstrap wins; logout invalidates stale responses; later login works.");
} finally {
  await browser?.close();
  await server?.close();
  await fs.rm(harnessPath, { force: true });
}
