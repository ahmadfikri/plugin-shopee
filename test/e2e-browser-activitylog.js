#!/usr/bin/env node
/**
 * REAL-BROWSER test for the activity log (v0.9.18).
 * Loads the real unpacked extension, runs a real keyword bulk scan through the
 * panel, clicks "⬇ Log aktivitas", and reads the DOWNLOADED JSON file — exactly
 * what Fikri will send back for analysis. Asserts the log really contains the
 * user's clicks and every stage of the bulk scan pipeline.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const EXT = path.resolve(__dirname, "..");
const FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-offer.html", "utf8");
const URL = "https://affiliate.shopee.co.id/offer/product_offer";

function loadPlaywright() {
  for (const c of ["playwright", "playwright-core",
    "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core",
    "/usr/local/lib/node_modules/@playwright/cli/node_modules/playwright-core"]) {
    try { return require(c); } catch (_) {}
  }
  return null;
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log("BROWSER E2E DILEWATI — playwright tidak terpasang."); process.exit(0); }
  const PROFILE_ROOT = path.join(EXT, ".e2e-profiles");
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(PROFILE_ROOT, "rm-e2e-"));
  const ctx = await pw.chromium.launchPersistentContext(profile, {
    headless: false, acceptDownloads: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      "--no-first-run", "--no-default-browser-check", "--window-position=-2400,-2400"]
  });
  let failed = null;
  try {
    await ctx.route("https://affiliate.shopee.co.id/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURE }));
    const page = ctx.pages()[0] || await ctx.newPage();
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-sl-kwinput", { timeout: 20000 });

    await page.fill(".rm-sl-kwinput", "tumbler");
    await page.click(".rm-sl-kwscan");
    await page.waitForFunction(() => {
      const t = (document.querySelector(".rm-sl-progress") || {}).textContent || "";
      return /Selesai — \d+\/\d+ kata kunci|Gagal/.test(t);
    }, { timeout: 90000 });
    await page.waitForTimeout(2000);   // let the post-scan render + flush land

    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.click(".rm-log-export")
    ]);
    assert(/^riset-activitylog-\d+\.json$/.test(dl.suggestedFilename()),
      "nama file log salah: " + dl.suggestedFilename());
    const file = await dl.path();
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    const types = doc.entries.map((e) => e.type);
    const has = (t) => types.includes(t);

    assert(has("page-open"), "tidak ada page-open");
    assert(doc.entries.find((e) => e.type === "page-open").d.version, "versi plugin tidak tercatat");
    const kwClick = doc.entries.find((e) => e.type === "click" && e.d && e.d.plugin &&
      /Bulk Scan Keyword|Memindai/.test(e.d.text || ""));
    assert(kwClick, "klik tombol Bulk Scan Keyword tidak tercatat");
    const inp = doc.entries.find((e) => e.type === "input" && e.d && e.d.value === "tumbler");
    assert(inp, "isian kata kunci tidak tercatat");
    assert(has("bulk-start"), "bulk-start tidak tercatat");
    const batch = doc.entries.find((e) => e.type === "bulk-batch");
    assert(batch && batch.d.cards > 0 && batch.d.parsed > 0 && batch.d.scored > 0,
      "bulk-batch tidak mencatat kartu/parse/skor: " + JSON.stringify(batch));
    assert(has("bulk-search-wait"), "hasil tunggu pencarian tidak tercatat");
    assert(has("bulk-progress"), "progress bulk tidak tercatat");
    assert(has("bulk-end"), "bulk-end tidak tercatat");
    const render = doc.entries.filter((e) => e.type === "shortlist-render").pop();
    assert(render && render.d.rowsInDom > 0,
      "shortlist-render tidak mencatat baris di layar: " + JSON.stringify(render));
    assert(doc.summary && doc.count === doc.entries.length, "ringkasan log salah");
    assert.strictEqual(errors.length, 0, "error JS di halaman: " + errors.join(" | "));

    console.log("BROWSER E2E ACTIVITY LOG LULUS");
    console.log("  " + doc.count + " baris log, tipe: " + Object.keys(doc.summary).join(", "));
    console.log("  batch: kartu " + batch.d.cards + " -> parse " + batch.d.parsed +
      " -> skor " + batch.d.scored + " -> total " + batch.d.total);
    console.log("  render terakhir: " + render.d.rowsInDom + " baris di layar, filter " + render.d.filter);
  } catch (e) { failed = e; }
  finally {
    await ctx.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
  if (failed) { console.error("BROWSER E2E GAGAL:", failed.message); process.exit(1); }
})();
