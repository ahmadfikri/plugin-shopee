#!/usr/bin/env node
/**
 * REAL-BROWSER regression for the 6 Okt bug (log v0.9.18):
 * "bulk scan jalan tapi tidak ada yang berubah di UI".
 *
 * The log proved the crawl stored every batch (1217 -> 1231, 180 products seen)
 * but the table kept showing the same cumulative top 20, because most products
 * were re-scans and the few new ones ranked below the old top 20.
 *
 * Expected since v0.9.19: after a category crawl the table shows THAT run's
 * products ("🆕 Hasil bulk scan terakhir (N baru)"), new ones first with a
 * BARU badge, the summary names the real new/updated counts, and
 * "Semua produk" returns to the cumulative list.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const EXT = path.resolve(__dirname, "..");
const FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-category.html", "utf8");
const URL = "https://affiliate.shopee.co.id/offer/product_offer";

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
  await page.waitForTimeout(1500);   // let the observer's post-crawl re-save land
  return page.evaluate(() => ({
    head: (document.querySelector(".rm-sl-head b") || {}).textContent || "",
    note: (document.querySelector(".rm-sl-progress") || {}).textContent || "",
    rows: document.querySelectorAll(".rm-sl-table tbody tr").length,
    badges: document.querySelectorAll(".rm-sl-table .rm-new-badge").length,
    firstRowNew: !!document.querySelector(".rm-sl-table tbody tr:first-child .rm-new-badge"),
    hasAllBtn: !!document.querySelector(".rm-sl-all")
  }));
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log("BROWSER E2E RUNVIEW DILEWATI — playwright tidak terpasang."); process.exit(0); }
  const PROFILE_ROOT = path.join(EXT, ".e2e-profiles");
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(PROFILE_ROOT, "rm-run-"));
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
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-sl-bulk", { timeout: 20000 });
    await page.waitForTimeout(1500);   // observer auto-captures the first page

    // Run 1: the opening page was already auto-captured, so its 6 products are
    // NOT new; the other 12 are.
    const r1 = await crawl(page);
    assert(/Hasil bulk scan terakhir/.test(r1.head), "run 1: tabel bukan tampilan hasil scan: " + r1.head);
    assert.strictEqual(r1.rows, 18, "run 1: harus 18 produk hasil scan, dapat " + r1.rows);
    assert.strictEqual(r1.badges, 12, "run 1: harus 12 BARU (6 sudah di-capture observer), dapat " + r1.badges);
    assert(r1.firstRowNew, "run 1: produk BARU harus di atas");
    assert(/12 BARU/.test(r1.note) && /6 sudah ada/.test(r1.note), "run 1: ringkasan salah: " + r1.note);
    assert(r1.hasAllBtn, "run 1: tombol 'Semua produk' tidak ada");

    // Run 2: same products again -> still shown (this run), 0 new.
    const r2 = await crawl(page);
    assert(/\(0 baru\)/.test(r2.head), "run 2: header harus (0 baru): " + r2.head);
    assert.strictEqual(r2.rows, 18, "run 2: produk hasil scan hilang setelah re-save observer: " + r2.rows);
    assert.strictEqual(r2.badges, 0, "run 2: tidak boleh ada BARU");
    assert(/0 BARU/.test(r2.note), "run 2: ringkasan salah: " + r2.note);

    // "Semua produk" goes back to the cumulative view.
    await page.click(".rm-sl-all");
    await page.waitForTimeout(500);
    const head = await page.textContent(".rm-sl-head b");
    assert(/kumulatif/.test(head), "'Semua produk' tidak kembali ke daftar kumulatif: " + head);

    assert.strictEqual(errors.length, 0, "error JS di halaman: " + errors.join(" | "));
    console.log("BROWSER E2E RUNVIEW LULUS");
    console.log("  setelah bulk scan tabel = hasil scan itu, BARU di atas: OK");
    console.log("  ringkasan menyebut jumlah BARU / sudah ada: OK");
    console.log("  re-save observer tidak menghapus hasil scan: OK");
    console.log("  'Semua produk' kembali ke kumulatif: OK");
  } catch (e) {
    failed = e;
  } finally {
    await ctx.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
  if (failed) { console.error("BROWSER E2E RUNVIEW GAGAL:", failed.message); process.exit(1); }
})();
