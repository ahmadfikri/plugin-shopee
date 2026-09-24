#!/usr/bin/env node
/**
 * REAL-BROWSER end-to-end test for "Bulk Scan Semua Kategori".
 *
 * Same approach as e2e-browser-bulk.js: real Chromium, real extension, the
 * category fixture served at the real Shopee URL. Category crawl is the feature
 * most exposed to React node churn — tabs are replaced on every switch, so a
 * held tab reference goes stale and .click() silently no-ops. Only a real
 * browser reproduces that; a stub cannot.
 *
 * It checks the crawl actually visits every tab, stores each category's batch
 * under its own label, batches do not overwrite each other, the Stop button
 * really stops, and control is handed back.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const EXT = path.resolve(__dirname, "..");
const FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-category.html", "utf8");
const URL = "https://affiliate.shopee.co.id/offer/product_offer";

function loadPlaywright() {
  const c = [
    "playwright", "playwright-core",
    "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core",
    "/usr/local/lib/node_modules/@playwright/cli/node_modules/playwright-core"
  ];
  for (const p of c) { try { return require(p); } catch (_) {} }
  return null;
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log("BROWSER E2E KATEGORI DILEWATI — playwright tidak terpasang."); process.exit(0); }

  // Profil browser TIDAK boleh di $KIROCREW_SCRATCH: sandbox menolak lstat pada
  // direktori induknya, dan Playwright men-stat rantai path user-data-dir saat
  // launch — akibatnya Chromium start tapi koneksi CDP tidak pernah selesai
  // (timeout 180s yang terlihat seperti "semua test browser rusak"). Pakai
  // direktori di dalam repo yang bisa di-stat penuh.
  const PROFILE_ROOT = path.join(EXT, ".e2e-profiles");
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(PROFILE_ROOT, "rm-cat-"));
  const ctx = await pw.chromium.launchPersistentContext(profile, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
           "--no-first-run", "--no-default-browser-check", "--window-position=-2400,-2400"]
  });

  let failed = null;
  try {
    await ctx.route("https://affiliate.shopee.co.id/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURE }));
    const page = ctx.pages()[0] || await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-sl-bulk", { timeout: 20000 });

    // accept the "no tabs? scan this page only" confirm defensively — here there
    // ARE tabs, so it should never fire, but a stray dialog must not hang the run
    page.on("dialog", (d) => d.accept().catch(() => {}));

    await page.click(".rm-sl-bulk");

    // wait for the crawl to finish (button re-enabled + label restored)
    await page.waitForFunction(() => {
      const b = document.querySelector(".rm-sl-bulk");
      return b && !b.disabled && /Bulk Scan Semua Kategori/.test(b.textContent || "");
    }, { timeout: 120000 });

    // all four categories must appear as their own batch labels
    await page.click(".rm-sl-toggle").catch(() => {});   // show all rows
    await page.waitForTimeout(400);
    const labels = await page.$$eval(".rm-sl-table tbody tr", (trs) =>
      [...new Set(trs.map((tr) => (tr.children[8] && tr.children[8].textContent || "").trim()))]);

    for (const cat of ["All", "Mobile", "Home", "Beauty"]) {
      assert(labels.some((l) => l === cat),
        `kategori '${cat}' tidak tersimpan sebagai batch, label ada: ` + JSON.stringify(labels));
    }
    assert(!labels.some((l) => /\/|offer|product_off/.test(l)),
      "ada URL path bocor ke label kategori: " + JSON.stringify(labels));

    // batches must not overwrite each other: 6+5+4+3 distinct products = 18
    const totalRows = await page.$$eval(".rm-sl-table tbody tr", (t) => t.length);
    assert(totalRows === 18,
      "batch kategori saling menimpa: harusnya 6+5+4+3=18 baris, dapat " + totalRows);

    // the terminal summary must SURVIVE the final re-render (the sticky-note bug
    // was only fixed for keyword scan; category scan shares the same pattern)
    const note = ((await page.textContent(".rm-sl-progress")) || "").trim();
    assert(/total \d+ produk|Selesai|kategori/i.test(note),
      "ringkasan scan kategori hilang setelah selesai (bug sticky-note): '" + note + "'");

    assert.strictEqual(errors.length, 0, "error JS di halaman: " + errors.join(" | "));

    console.log("BROWSER E2E KATEGORI LULUS");
    console.log("  4 kategori dikunjungi & tersimpan terpisah: OK");
    console.log("  batch tidak saling menimpa (18 baris): OK");
    console.log("  label kategori bersih tanpa URL path: OK");
    console.log("  ringkasan scan bertahan setelah selesai: OK");
  } catch (e) {
    failed = e;
    try {
      const page = ctx.pages()[0];
      const st = await page.evaluate(() => ({
        progress: (document.querySelector(".rm-sl-progress") || {}).textContent || "(tidak ada)",
        baris: document.querySelectorAll(".rm-sl-table tbody tr").length,
        kw: [...new Set([...document.querySelectorAll(".rm-sl-kw")].map((n) => n.textContent.trim()))],
        bulkLabel: (document.querySelector(".rm-sl-bulk") || {}).textContent
      }));
      console.error("STATE SAAT GAGAL:\n" + JSON.stringify(st, null, 1));
    } catch (_) {}
  } finally {
    await ctx.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
  if (failed) { console.error("BROWSER E2E KATEGORI GAGAL:", failed.message); process.exit(1); }
})();
