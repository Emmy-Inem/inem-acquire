// Run against a built preview or deployment, not Vite's development CSS.
import assert from "node:assert/strict";
import {chromium} from "playwright";
const base=process.env.MOBILE_CHECK_URL || "http://127.0.0.1:5174";
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
  for (const width of [320,390,768,820]) {
    const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,isMobile:true});
    await page.goto(base);
    assert.match(await page.locator('.publicNav').evaluate(e=>getComputedStyle(e).backdropFilter),/blur\(14px\)/,"Built navigation lost its blur");
    await page.getByRole('button',{name:'Toggle navigation'}).tap();
    const panel=page.getByRole('dialog',{name:'Site navigation'});
    await panel.waitFor();
    assert.match(await panel.evaluate(e=>getComputedStyle(e).backdropFilter),/blur\(20px\)/,"Built mobile menu lost its blur");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.keyboard.press('Escape');
    await panel.waitFor({state:'hidden'});
    await page.goto(base+'/signup');
    assert.equal(await page.getByLabel('Password',{exact:true}).evaluate(e=>getComputedStyle(e).fontSize),'16px');
    console.log(`PASS built mobile layout, glass and controls at ${width}px`);
    await page.close();
  }
} finally {await browser.close();}
