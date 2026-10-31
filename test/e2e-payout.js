#!/usr/bin/env node
/* v0.9.31: payout page parser + REAL-BROWSER panel on the payout page.
 * Fixture = Fikri's Payout Details screenshot (31 Okt 2026). Proves the parser
 * reads payout / eligible / WHT / per-day completed commission, the numbers add
 * up, the bank account is never stored, the red "0 produk" banner is gone, and
 * the record lands in chrome.storage. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const P = require("../src/payout.js");
const HTML = fs.readFileSync(__dirname + "/fixtures/shopee-payout-detail.html", "utf8");
const text = HTML.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "\n");

const r = P.parseDetail(text);
assert.ok(r, "parsed");
assert.strictEqual(r.payoutId, "11300901968261028");
assert.strictEqual(r.payout, 2118131);
assert.strictEqual(r.eligible, 2172722);
assert.strictEqual(r.wht, 54591);
assert.strictEqual(r.days.length, 4);
assert.deepStrictEqual(r.days[0], { date: "2026-10-22", amount: 436604 });
assert.strictEqual(r.created, "2026-10-28");
assert.strictEqual(r.paidAt, "2026-10-30");
assert.strictEqual(r.status, "paid");
assert.ok(r.consistent, "days sum = eligible and eligible - wht = payout");
assert.ok(Math.abs(r.whtRate - 0.0251) < 0.0005, "WHT ~2.5%: " + r.whtRate);
assert.ok(!JSON.stringify(r).includes("SeaBank") && !JSON.stringify(r).includes("0000"), "no bank data stored");
assert.strictEqual(P.parseDetail("Payout Record list without detail"), null);
const csv = P.toCsv({ [r.payoutId]: r });
assert.strictEqual(csv.trim().split("\n").length, 5, "header + 4 days");
assert.ok(P.isPayoutPage({ hostname: "affiliate.shopee.co.id", pathname: "/payment/payout_record/detail" }));
assert.ok(!P.isPayoutPage({ hostname: "affiliate.shopee.co.id", pathname: "/offer/product_offer" }));
console.log("PASS  parser payout: Rp2.118.131 cair, WHT 2,51%, 4 hari, angka cocok, tanpa data bank");

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
  if (!pw) { console.log("PAYOUT OK (browser dilewati — playwright tidak terpasang)"); return; }
  const EXT = path.resolve(__dirname, "..");
  const root = path.join(EXT, ".e2e-profiles"); fs.mkdirSync(root, { recursive: true });
  const ctx = await pw.chromium.launchPersistentContext(fs.mkdtempSync(path.join(root, "rm-pay-")), {
    headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      "--no-first-run", "--no-default-browser-check", "--window-position=-2400,-2400"] });
  let code = 0;
  try {
    await ctx.route("https://affiliate.shopee.co.id/**", (rt) => rt.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: HTML }));
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    const page = ctx.pages()[0] || await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("https://affiliate.shopee.co.id/payment/payout_record/detail?id=11300901968261028", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-payout", { timeout: 20000 });
    const txt = await page.textContent(".rm-payout");
    assert.match(txt, /11300901968261028/); assert.match(txt, /Rp2\.118\.131/); assert.match(txt, /2,51%|2\.51%/);
    assert.strictEqual(await page.locator(".rm-diag").count(), 0, "red '0 produk' banner must not show on payout page");
    const saved = await sw.evaluate(() => new Promise((ok) => chrome.storage.local.get("rm_payouts", (o) => ok(o.rm_payouts || {}))));
    assert.ok(saved["11300901968261028"] && saved["11300901968261028"].payout === 2118131, "saved to storage");
    const dl = page.waitForEvent("download", { timeout: 10000 });
    await page.click(".rm-pay-csv");
    const f = await dl; const p2 = await f.path();
    assert.strictEqual(fs.readFileSync(p2, "utf8").trim().split("\n").length, 5, "CSV 4 rows");
    // a non-payout affiliate page (dashboard) also stays silent
    await page.goto("https://affiliate.shopee.co.id/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    assert.strictEqual(await page.locator(".rm-diag").count(), 0, "no banner on dashboard");
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("PASS  browser: panel payout tampil, tersimpan, CSV 4 baris, banner merah hilang");
    console.log("PAYOUT OK");
  } catch (e) { console.error("PAYOUT GAGAL:", e.message); code = 1; }
  finally { await ctx.close(); }
  process.exit(code);
})();
