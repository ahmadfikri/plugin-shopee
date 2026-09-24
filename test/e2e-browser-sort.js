#!/usr/bin/env node
/**
 * REAL-BROWSER end-to-end test for table sorting + shortlist controls.
 *
 * Real Chromium + real extension on the keyword fixture. Sorting is pure DOM
 * reordering, but it is wired by event delegation and reads a data-sort
 * attribute per cell — exactly the kind of thing that silently breaks when a
 * column's markup changes. Only a real render proves the arrows work, that
 * numeric columns sort numerically (not lexically: "Rp1.000" before "Rp9" is
 * the classic bug), and that a click toggles asc/desc.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const EXT = path.resolve(__dirname, "..");
const FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-offer.html", "utf8");
const URL = "https://affiliate.shopee.co.id/offer/product_offer";

function loadPlaywright() {
  const c = ["playwright", "playwright-core",
    "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core",
    "/usr/local/lib/node_modules/@playwright/cli/node_modules/playwright-core"];
  for (const p of c) { try { return require(p); } catch (_) {} }
  return null;
}

const nums = (arr) => arr.map((s) => Number(String(s).replace(/[^0-9.-]/g, ""))).filter(Number.isFinite);
const asc = (a) => a.every((v, i) => i === 0 || a[i - 1] <= v);
const desc = (a) => a.every((v, i) => i === 0 || a[i - 1] >= v);

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log("BROWSER E2E SORT DILEWATI — playwright tidak terpasang."); process.exit(0); }

  // Profil browser TIDAK boleh di $KIROCREW_SCRATCH: sandbox menolak lstat pada
  // direktori induknya, dan Playwright men-stat rantai path user-data-dir saat
  // launch — akibatnya Chromium start tapi koneksi CDP tidak pernah selesai
  // (timeout 180s yang terlihat seperti "semua test browser rusak"). Pakai
  // direktori di dalam repo yang bisa di-stat penuh.
  const PROFILE_ROOT = path.join(EXT, ".e2e-profiles");
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(PROFILE_ROOT, "rm-sort-"));
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
    await page.waitForSelector(".rm-sl-table tbody tr", { timeout: 20000 });

    // single merged research table (opsi B): product-table lama sudah dibuang,
    // sort sekarang diuji pada .rm-sl-table.
    const priceColHeader = await page.$$eval(".rm-sl-table thead th",
      (ths) => ths.findIndex((t) => /Harga/.test(t.textContent || "")));
    assert(priceColHeader >= 0, "kolom Harga tidak ditemukan di tabel");

    const readCol = (col) => page.$$eval(
      ".rm-sl-table tbody tr",
      (trs, c) => trs.map((tr) => (tr.children[c] && tr.children[c].textContent || "").trim()),
      col);

    // click the Harga sort button once -> descending
    const sortBtns = await page.$$(".rm-sl-table thead .rm-sort");
    assert(sortBtns.length >= 5, "tombol sort tidak ada di setiap kolom, dapat " + sortBtns.length);
    await sortBtns[priceColHeader].click();
    await page.waitForTimeout(150);
    let prices = nums(await readCol(priceColHeader));
    assert(prices.length >= 3, "butuh beberapa baris berharga untuk menguji sort");
    assert(desc(prices), "sort pertama harus menurun (desc): " + prices.join(","));

    // arrow reflects direction
    const arrow1 = await sortBtns[priceColHeader].textContent();
    assert(/↓/.test(arrow1), "panah harus ↓ setelah sort desc, dapat: " + arrow1);

    // click again -> ascending, and NUMERICALLY (Rp90.000 must not sort before Rp9.000)
    await sortBtns[priceColHeader].click();
    await page.waitForTimeout(150);
    prices = nums(await readCol(priceColHeader));
    assert(asc(prices), "sort kedua harus menaik (asc) & numerik: " + prices.join(","));
    const arrow2 = await page.$eval(
      `.rm-sl-table thead .rm-sort[data-col="${priceColHeader}"]`,
      (b) => b.textContent);
    assert(/↑/.test(arrow2), "panah harus ↑ setelah sort asc, dapat: " + arrow2);

    // only ONE column may show an active arrow at a time
    const active = await page.$$eval(".rm-sl-table thead .rm-sort",
      (bs) => bs.filter((b) => b.hasAttribute("data-dir")).length);
    assert.strictEqual(active, 1, "hanya satu kolom boleh aktif ter-sort, dapat " + active);

    // text column sorts lexically (Produk = col of the name)
    const nameCol = await page.$$eval(".rm-sl-table thead th",
      (ths) => ths.findIndex((t) => /Produk/.test(t.textContent || "")));
    await page.click(`.rm-sl-table thead .rm-sort[data-col="${nameCol}"]`);
    await page.waitForTimeout(150);
    const names = await readCol(nameCol);
    const sorted = [...names].sort((a, b) => b.localeCompare(a, "id-ID"));
    assert.deepStrictEqual(names, sorted, "kolom teks harus urut leksikal desc");

    assert.strictEqual(errors.length, 0, "error JS: " + errors.join(" | "));

    console.log("BROWSER E2E SORT LULUS");
    console.log("  tombol sort ada di tiap kolom: OK");
    console.log("  klik: desc lalu asc, panah ↓/↑ benar: OK");
    console.log("  kolom angka sort numerik (bukan leksikal): OK");
    console.log("  hanya satu kolom aktif sekaligus: OK");
    console.log("  kolom teks sort leksikal: OK");
  } catch (e) {
    failed = e;
    try {
      const page = ctx.pages()[0];
      const st = await page.evaluate(() => ({
        adaTabel: !!document.querySelector(".rm-panel .rm-table"),
        header: [...document.querySelectorAll(".rm-panel .rm-table thead th")].map((t) => t.textContent.trim()),
        baris: document.querySelectorAll(".rm-panel .rm-table:not(.rm-sl-table) tbody tr").length
      }));
      console.error("STATE SAAT GAGAL:\n" + JSON.stringify(st, null, 1));
    } catch (_) {}
  } finally {
    await ctx.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
  if (failed) { console.error("BROWSER E2E SORT GAGAL:", failed.message); process.exit(1); }
})();
