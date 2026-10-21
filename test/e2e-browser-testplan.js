/* e2e-browser-testplan.js — v0.9.26 real Chromium + unpacked extension:
 * import the REAL snapshot, run a bulk scan on the category fixture, and check
 *   * the 🎲 test-plan block renders above the shortlist with 3 picks,
 *   * every pick has a finite ROAS / P(≥1x) / Dipilih, no NaN/undefined,
 *   * the bulk scan itself still yields its 18 products and 0 page errors,
 *   * the plan does not reshuffle on re-render (deterministic seed).
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const EXT = path.resolve(__dirname, "..");
const FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-category.html", "utf8");
const URL = "https://affiliate.shopee.co.id/offer/product_offer";
const SNAP = JSON.parse(fs.readFileSync(path.join(EXT, "export", "performance-snapshot.json"), "utf8"));

function loadPlaywright() {
  const c = ["playwright", "playwright-core",
    "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core",
    "/usr/local/lib/node_modules/@playwright/cli/node_modules/playwright-core"];
  for (const p of c) { try { return require(p); } catch (_) {} }
  return null;
}

async function crawl(page) {
  await page.click(".rm-sl-bulk");
  await page.waitForFunction(() => {
    const b = document.querySelector(".rm-sl-bulk");
    return b && !b.disabled && /Bulk Scan Semua Kategori/.test(b.textContent || "");
  }, { timeout: 120000 });
  await page.waitForTimeout(1500);
}
const readPlan = (page) => page.evaluate(() => {
  const el = document.querySelector(".rm-plan");
  return {
    present: !!el, text: el ? el.textContent : "",
    rows: Array.from(document.querySelectorAll(".rm-plan-table tbody tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim())),
    slRows: document.querySelectorAll(".rm-sl-table tbody tr").length
  };
});

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log("BROWSER E2E TESTPLAN DILEWATI — playwright tidak terpasang."); process.exit(0); }
  const PROFILE_ROOT = path.join(EXT, ".e2e-profiles");
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(PROFILE_ROOT, "rm-plan-"));
  const ctx = await pw.chromium.launchPersistentContext(profile, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
           "--no-first-run", "--no-default-browser-check", "--window-position=-2400,-2400"]
  });
  let failed = null;
  try {
    await ctx.route("https://affiliate.shopee.co.id/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURE }));
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });
    await sw.evaluate((s) => new Promise((r) => chrome.storage.local.set({ rm_perf: s }, r)), SNAP);

    const page = ctx.pages()[0] || await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-sl-bulk", { timeout: 20000 });
    await page.waitForTimeout(1500);

    await crawl(page);
    const p1 = await readPlan(page);
    assert.strictEqual(p1.slRows, 18, "bulk scan harus tetap 18 produk, dapat " + p1.slRows);
    assert(p1.present, "blok rencana uji tidak muncul");
    // the fixture's 18 products are all "lainnya" (ROAS ~0.3): the block must
    // WARN instead of recommending a test
    assert(/Belum ada kandidat yang layak diuji/.test(p1.text) && /scan niche lain/.test(p1.text),
      "kandidat lemah harus diberi peringatan: " + p1.text.slice(0, 160));
    assert.strictEqual(p1.rows.length, 3, "harus 3 pilihan, dapat " + p1.rows.length);
    for (const r of p1.rows) {
      assert(/^\d+\.\d\dx$/.test(r[4]), "ROAS tidak valid: " + r.join(" | "));
      assert(/^(≥|≤)?\d+%$/.test(r[5]) && /^(≥|≤)?\d+%$/.test(r[6]), "persen tidak valid: " + r.join(" | "));
    }
    assert(!/\bNaN\b|undefined|\bnull\b/.test(p1.text), "NaN/undefined/null di rencana uji");

    // re-render (open/close "semua") must keep the same picks
    await page.click(".rm-sl-toggle"); await page.waitForTimeout(400);
    await page.click(".rm-sl-toggle"); await page.waitForTimeout(400);
    const p2 = await readPlan(page);
    assert.deepStrictEqual(p2.rows.map((r) => r[1]), p1.rows.map((r) => r[1]), "rencana uji berubah setelah render ulang");

    assert.deepStrictEqual(errors, [], "page error: " + errors.join("; "));
    console.log("BROWSER E2E TESTPLAN LULUS");
    p1.rows.forEach((r) => console.log("   ", r.slice(1).join(" | ")));
  } catch (e) { failed = e; }
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  if (failed) { console.error("BROWSER E2E TESTPLAN GAGAL:", failed.message); process.exit(1); }
})();
