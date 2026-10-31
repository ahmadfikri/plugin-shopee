#!/usr/bin/env node
/**
 * REAL-BROWSER test for 🚀 Launch pack (v0.9.32). Product fixture + snapshot,
 * DeepSeek mocked. Proves one click yields campaign name == short-link sub_id,
 * the short-link with the default affiliate id, caption, video prompt and the
 * checklist (after-tax Max CPC, 2x24 jam, CPR 200, scale 1.4) with no price, and
 * that opening the product URL with #rm-launch builds the pack by itself.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const EXT = path.resolve(__dirname, "..");
const FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-product.html", "utf8");
const SNAP = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "performance-snapshot-2026-10-21.json"), "utf8"));

function loadPlaywright() {
  for (const p of ["playwright", "playwright-core",
    "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core",
    "/usr/local/lib/node_modules/@playwright/cli/node_modules/playwright-core"]) {
    try { return require(p); } catch (_) {}
  }
  return null;
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log("BROWSER E2E LAUNCH DILEWATI — playwright tidak terpasang."); process.exit(0); }
  const root = path.join(EXT, ".e2e-profiles"); fs.mkdirSync(root, { recursive: true });
  const ctx = await pw.chromium.launchPersistentContext(fs.mkdtempSync(path.join(root, "rm-launch-")), {
    headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      "--no-first-run", "--no-default-browser-check", "--window-position=-2400,-2400"] });
  const kill = setTimeout(() => { console.error("BROWSER E2E LAUNCH GAGAL: timeout"); process.exit(1); }, 150000);
  let code = 0;
  try {
    await ctx.route("https://shopee.co.id/**", (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURE }));
    await ctx.route("https://down-id.img.susercontent.com/**", (r) => r.fulfill({ status: 404, body: "" }));
    let calls = 0;
    await ctx.route("https://api.deepseek.com/**", (r) => {
      calls++;
      const isVideo = /video/i.test(JSON.parse(r.request().postData()).messages[0].content.slice(0, 400));
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content:
        calls === 1 ? "Taplak ini bikin meja langsung rapi\n#fyp #viral #masukberanda #rumah" : "Buatkan video 10 detik: tangan meletakkan taplak di meja kayu." } }] }) });
    });
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    await sw.evaluate((s) => new Promise((r) => chrome.storage.local.set({ rm_perf: s,
      rm_config: { ai: { enabled: true, apiKey: "test-key" } } }, r)), SNAP);

    const page = ctx.pages()[0] || await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("https://shopee.co.id/product/123/456", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-pp-root .rm-launch", { timeout: 20000 });
    await page.click(".rm-pp-root .rm-launch");
    await page.waitForFunction(() => /=== 5\. CHECKLIST/.test((document.querySelector(".rm-pp-root .rm-out-ta") || {}).value || ""), null, { timeout: 30000 });
    const pack = await page.$eval(".rm-pp-root .rm-out-ta", (t) => t.value);
    const lines = pack.split("\n");
    const camp = lines[lines.indexOf(lines.find((l) => /NAMA CAMPAIGN/.test(l))) + 1].trim();
    const link = (pack.match(/https:\/\/s\.shopee\.co\.id\/an_redir\S+/) || [""])[0];
    const sub = decodeURIComponent((link.match(/sub_id=([^&-]+)/) || [])[1] || "");
    assert.ok(camp && camp === sub, `campaign "${camp}" must equal sub_id "${sub}"`);
    assert.match(link, /affiliate_id=11300901968/);
    assert.match(pack, /Taplak ini bikin meja/); assert.match(pack, /Buatkan video 10 detik/);
    assert.match(pack, /Max CPC Meta \(setelah pajak\): Rp/); assert.match(pack, /2x24 jam/); assert.match(pack, /1,4/);
    assert.ok(!/Rp\s?\d/.test(pack.split("=== 5.")[0].replace(/https\S+/g, "")), "no price in caption/prompt part");
    assert.strictEqual(calls, 2, "caption + video = 2 calls");
    console.log("PASS  1 klik: campaign = sub_id (" + camp + "), short-link, caption, prompt, checklist");

    const p2 = await ctx.newPage();
    await p2.goto("https://shopee.co.id/product/123/456#rm-launch", { waitUntil: "domcontentloaded" });
    await p2.waitForFunction(() => /=== 5\. CHECKLIST/.test((document.querySelector(".rm-pp-root .rm-out-ta") || {}).value || ""), null, { timeout: 30000 });
    console.log("PASS  #rm-launch dari Ad Library: Launch pack dibuat otomatis");
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("BROWSER E2E LAUNCH OK");
  } catch (e) { console.error("BROWSER E2E LAUNCH GAGAL:", e.message); code = 1; }
  finally { clearTimeout(kill); await ctx.close(); }
  process.exit(code);
})();
