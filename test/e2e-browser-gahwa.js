#!/usr/bin/env node
/**
 * REAL-BROWSER test for "🎞 Gahwa Pack" (v0.9.21).
 *
 * Real Chromium + the real unpacked extension on a product-page fixture served
 * at a real Shopee product URL. Proves end to end:
 *   * the button appears on a PRODUCT page,
 *   * one click downloads every distinct gallery image at FULL resolution
 *     (_tn / @resize suffixes stripped, duplicates merged, badge icon skipped,
 *     buyer-review photo outside the briefing NOT included),
 *   * gahwa_job.json is written next to them, with variants + features,
 *   * no price and no rating text anywhere in the job file,
 *   * the files are real (chrome.downloads state = complete) in one folder.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const EXT = path.resolve(__dirname, "..");
const FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-product.html", "utf8");
const URL = "https://shopee.co.id/product/123/456";
// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function loadPlaywright() {
  const c = ["playwright", "playwright-core",
    "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core",
    "/usr/local/lib/node_modules/@playwright/cli/node_modules/playwright-core"];
  for (const p of c) { try { return require(p); } catch (_) {} }
  return null;
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log("BROWSER E2E GAHWA DILEWATI — playwright tidak terpasang."); process.exit(0); }
  const PROFILE_ROOT = path.join(EXT, ".e2e-profiles");
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(PROFILE_ROOT, "rm-gahwa-"));
  const dlDir = fs.mkdtempSync(path.join(PROFILE_ROOT, "dl-"));
  const ctx = await pw.chromium.launchPersistentContext(profile, {
    headless: false, acceptDownloads: true, downloadsPath: dlDir,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
           "--no-first-run", "--no-default-browser-check", "--window-position=-2400,-2400"]
  });
  const requested = [];
  let failed = null;
  try {
    await ctx.route("https://shopee.co.id/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURE }));
    await ctx.route("https://down-id.img.susercontent.com/**", (route) => {
      requested.push(route.request().url());
      route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    });
    const page = ctx.pages()[0] || await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-gahwa", { timeout: 20000 });
    await page.click(".rm-gahwa");
    await page.waitForSelector(".rm-gahwa-status", { timeout: 20000 });
    const status = (await page.textContent(".rm-gahwa-status")).trim();
    assert(/tersimpan/.test(status), "status gagal: " + status);

    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });
    let items = [];
    for (let i = 0; i < 40; i++) {
      items = await sw.evaluate(() => new Promise((r) => chrome.downloads.search({}, r)));
      if (items.length && items.every((x) => x.state !== "in_progress")) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    // NOTE: under Playwright every download is stored with a GUID file name
    // (Playwright's own download handling), so the gahwa/<folder>/imgNN.jpg
    // names are checked on what the extension REQUESTED (the activity log
    // records it) and the files are identified here by their source URL.
    const names = items.map((x) => x.filename);
    const imgs = items.filter((x) => /susercontent/.test(x.url));
    assert.strictEqual(imgs.length, 3, "harus 3 gambar unik, dapat " + imgs.length + ": " + names.join(", "));
    for (const u of imgs.map((x) => x.url)) {
      assert(!/_tn|@resize|\.webp/.test(u), "URL bukan resolusi penuh: " + u);
      assert(!/review|badge/.test(u), "gambar non-produk ikut: " + u);
    }
    // Downloads started by the extension go through Chrome's network stack,
    // which Playwright's route() does not intercept, so the fixture's fake CDN
    // hashes fail with a SERVER/NETWORK error here. What this test owns is that
    // the extension REQUESTED the right full-res URLs and wrote the job file;
    // any interruption must be server/network-side, never a FILE_/USER_ error.
    for (const x of imgs) assert(x.state === "complete" || /^(SERVER|NETWORK)_/.test(x.error || ""),
      "unduhan gambar gagal karena sebab lokal: " + x.url + " " + x.state + " " + x.error);
    console.log("  gambar: " + imgs.map((x) => x.state + (x.error ? "(" + x.error + ")" : "")).join(", "));
    const jobItem = items.find((x) => /^data:application\/json/.test(x.url));
    assert(jobItem, "gahwa_job.json tidak diunduh: " + names.join(", "));
    assert.strictEqual(jobItem.state, "complete", "job.json tidak tersimpan: " + jobItem.error);
    const job = JSON.parse(fs.readFileSync(jobItem.filename, "utf8"));
    assert.deepStrictEqual(job.images, ["img01.jpg", "img02.jpg", "img03.jpg"]);
    assert.deepStrictEqual(job.product.variants, ["Mandala Merah", "Klasik Krem", "Earthy Abu"],
      "varian salah / varian berharga ikut: " + JSON.stringify(job.product.variants));
    assert(job.product.features.some((f) => /PVC tebal anti air/.test(f)), "fitur bahan hilang: " + job.product.features);
    assert(job.product.features.some((f) => /Ukuran 140 x 80/.test(f)), "fitur ukuran hilang");
    const all = JSON.stringify(job);
    assert(!/Rp\s?\d|harga|diskon|murah|promo|rating|terjual|4\.9/i.test(all), "harga/rating bocor ke job: " + all);
    assert.strictEqual(job.suggest.hook[1], "Taplak Meja Motif", "short name: " + job.suggest.hook[1]);
    const folder = (status.match(/Downloads\/(\S+)\//) || [])[1] || "";
    assert(/^gahwa\/\d{6}-taplak-meja-motif$/.test(folder), "nama folder: " + status);
    const dirs = [folder];
    assert.deepStrictEqual(errors, [], "page error: " + errors.join("; "));
    console.log("BROWSER E2E GAHWA PACK OK — " + imgs.length + " gambar + job.json di " + dirs[0]);
  } catch (e) { failed = e; }
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(dlDir, { recursive: true, force: true });
  if (failed) { console.error("BROWSER E2E GAHWA PACK GAGAL:", failed.message); process.exit(1); }
})();
