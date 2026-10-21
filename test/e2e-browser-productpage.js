#!/usr/bin/env node
/**
 * REAL-BROWSER test for the v0.9.25 product-page panel (src/productpage.js).
 *
 * Real Chromium + the unpacked extension on the product-page fixture served at
 * a real Shopee product URL. Proves:
 *   * without a snapshot the panel renders and asks for an import (no crash),
 *   * with the REAL snapshot (+ one tag matching the fixture product) it shows a
 *     verdict, the value-vs-CPC chart, the benchmark, the evidence block and the
 *     product's experiment history,
 *   * no 'NaN' / 'undefined' / 'null' leaks into the rendered text,
 *   * dropped cards (Stok, Umur listing, Lokasi toko, Official) are gone,
 *   * every action button the old modal had is still there and wired
 *     (Eksperimen Baru, minimise, ✕), and a click on the panel's own padding
 *     no longer deletes it,
 *   * zero page errors.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const EXT = path.resolve(__dirname, "..");
const FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-product.html", "utf8");
const URL = "https://shopee.co.id/product/123/456";
const SNAP = JSON.parse(fs.readFileSync(path.join(EXT, "export", "performance-snapshot.json"), "utf8"));

function loadPlaywright() {
  const c = ["playwright", "playwright-core",
    "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core",
    "/usr/local/lib/node_modules/@playwright/cli/node_modules/playwright-core"];
  for (const p of c) { try { return require(p); } catch (_) {} }
  return null;
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log("BROWSER E2E PRODUCT PAGE DILEWATI — playwright tidak terpasang."); process.exit(0); }
  const PROFILE_ROOT = path.join(EXT, ".e2e-profiles");
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(PROFILE_ROOT, "rm-pp-"));
  const ctx = await pw.chromium.launchPersistentContext(profile, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
           "--no-first-run", "--no-default-browser-check", "--window-position=-2400,-2400"]
  });
  let failed = null;
  try {
    await ctx.route("https://shopee.co.id/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURE }));
    await ctx.route("https://down-id.img.susercontent.com/**", (route) => route.fulfill({ status: 404, body: "" }));
    const page = ctx.pages()[0] || await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    // ---- 1) no snapshot: panel renders, asks for import ----
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-pp-root .rm-pp-action", { timeout: 20000 });
    const a0 = (await page.textContent(".rm-pp-action")).trim();
    assert.strictEqual(a0, "IMPOR DATA", "tanpa snapshot harus minta impor, dapat: " + a0);

    // ---- 2) inject real snapshot + a tag matching the fixture + a past experiment ----
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });
    const snap = JSON.parse(JSON.stringify(SNAP));
    snap.tags.taplakMeja = { clicks: 2400, orders: 130, commission: 420000, spend: 160000,
      conversionRate: 5.4, epc: 175, roas: 2.63, trusted: true, verdict: "winner",
      firstDate: "2026-09-20", lastDate: "2026-10-18", days: 29,
      metaClicks: 1100, metaCpc: 145, arrival: 1.9 };
    const exp = { counters: {}, rows: [{ experimentId: "taplakfb261012abc123", campaignTag: "taplakfb261012abc123",
      concept: "before_after", ts: Date.parse("2026-10-12T03:00:00Z"), productId: "123.456",
      productUrl: URL, productName: "Taplak" }] };
    await sw.evaluate(([s, e]) => new Promise((r) =>
      chrome.storage.local.set({ rm_perf: s, rm_experiments_v1: e }, r)), [snap, exp]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-pp-root .rm-pp-svg", { timeout: 20000 });
    await page.waitForFunction(() => {
      const h = document.querySelector(".rm-pp-hist-body");
      return h && !/memuat/.test(h.textContent);
    }, { timeout: 10000 });

    const action = (await page.textContent(".rm-pp-action")).trim();
    assert(/IKLANKAN|LAYAK COBA/.test(action), "tag winner harus IKLANKAN/LAYAK COBA, dapat: " + action);
    const body = (await page.textContent(".rm-pp-root .rm-modal-body")) || "";
    assert(/taplakMeja/.test(body), "dasar data tidak menyebut tag acuan");
    assert(/Max CPC Meta/.test(body) && /Prediksi ROAS/.test(body) && /P\(untung\)/.test(body), "angka utama hilang");
    assert(/Nilai 1 klik Meta vs biaya 1 klik Meta/.test(body), "chart nilai vs CPC hilang");
    assert(/ROAS dibanding patokan/.test(body), "chart patokan hilang");
    assert(/taplakfb261012abc123/.test(body), "riwayat eksperimen tidak tampil");
    assert(!/\bNaN\b|undefined|\bnull\b/.test(body), "ada NaN/undefined/null di panel: " +
      (body.match(/.{0,40}(NaN|undefined|null).{0,40}/) || [""])[0]);
    for (const gone of ["Umur listing", "Lokasi toko", "Official?", "Stok"]) {
      assert(!body.includes(gone), "kartu lama masih ada: " + gone);
    }
    for (const sel of [".rm-ai2", ".rm-vprompt", ".rm-gahwa", ".rm-exp-new", ".rm-star2", ".rm-capture", ".rm-modal-x", ".rm-out"]) {
      assert(await page.$(".rm-pp-root " + sel), "tombol/elemen hilang: " + sel);
    }

    // ---- 3) interactions ----
    if (process.env.RM_SHOT) {
      await page.setViewportSize({ width: 1100, height: 1500 });
      await (await page.$(".rm-pp-root")).screenshot({ path: process.env.RM_SHOT });
    }
    await page.click(".rm-pp-root .rm-exp-new");
    assert(/Eksperimen baru siap/.test(await page.textContent(".rm-pp-root .rm-exp")), "Eksperimen Baru tidak bereaksi");
    await page.click(".rm-pp-min");
    assert(!(await page.isVisible(".rm-pp-root .rm-modal-body")), "panel tidak menciut");
    await page.click(".rm-pp-min");
    assert(await page.isVisible(".rm-pp-root .rm-modal-body"), "panel tidak terbuka lagi");
    await page.click(".rm-pp-root", { position: { x: 2, y: 2 } });   // the panel's own padding
    assert(await page.$(".rm-pp-root"), "klik di padding panel menghapus panel");
    await page.click(".rm-pp-root .rm-modal-x");
    await page.waitForFunction(() => !document.querySelector(".rm-pp-root"), { timeout: 5000 });

    // ---- 4) v0.9.26: NEW product (no tag) with a Shopee breadcrumb -> niche prior ----
    const NEW_URL = "https://shopee.co.id/product/123/789";
    const NEW_HTML = FIXTURE
      .replace(/COD Taplak Meja Motif Mandala PVC Anti Air Murah/, "Casing Samsung A55 Motif Bunga Glossy")
      .replace("<main>", '<main><div class="page-product__breadcrumb"><a href="/">Shopee</a> ' +
        '<a href="/Handphone-Aksesoris-cat.11044458">Handphone &amp; Aksesoris</a> ' +
        '<a href="/Handphone-Aksesoris-cat.11044458.11044476">Casing &amp; Covers</a></div>');
    await ctx.route(NEW_URL, (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: NEW_HTML }));
    await page.goto(NEW_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-pp-root .rm-pp-svg", { timeout: 20000 });
    const a4 = (await page.textContent(".rm-pp-action")).trim();
    if (process.env.RM_SHOT2) {
      await page.setViewportSize({ width: 1100, height: 1500 });
      await (await page.$(".rm-pp-root")).screenshot({ path: process.env.RM_SHOT2 });
    }
    const b4 = (await page.textContent(".rm-pp-root .rm-modal-body")) || "";
    assert.strictEqual(a4, "UJI KECIL", "produk baru niche hp harus UJI KECIL, dapat: " + a4);
    assert(/kategori Shopee: Handphone & Aksesoris/.test(b4), "niche tidak diambil dari breadcrumb");
    assert(/Casing & aksesoris HP/.test(b4) && /Peluang balik modal/.test(b4), "info niche hilang");
    assert(/CPC rata-rata niche/.test(b4), "CPC tidak dari niche");
    assert(!/\bNaN\b|undefined|\bnull\b/.test(b4), "ada NaN/undefined/null di panel niche: " +
      (b4.match(/.{0,40}(NaN|undefined|null).{0,40}/) || [""])[0]);

    assert.deepStrictEqual(errors, [], "page error: " + errors.join("; "));
    console.log(`BROWSER E2E PRODUCT PAGE OK — vonis ${action}, chart + patokan + riwayat tampil, 0 error`);
  } catch (e) { failed = e; }
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  if (failed) { console.error("BROWSER E2E PRODUCT PAGE GAGAL:", failed.message); process.exit(1); }
})();
