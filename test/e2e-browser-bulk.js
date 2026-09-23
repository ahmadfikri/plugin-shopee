#!/usr/bin/env node
/**
 * REAL-BROWSER end-to-end test for bulk keyword scan.
 *
 * Why this file exists: every other test in this suite is a Node stub. They
 * assert that functions behave when handed fake objects, which is why the whole
 * suite could pass green while bulk search did nothing in Chrome. Nothing here
 * is stubbed — a real Chromium loads the real unpacked extension, the real
 * content scripts inject, and the scan is driven through the real panel UI.
 *
 * The Shopee page is served at its real URL by request interception
 * (test/fixtures/shopee-offer.html), so no login and no network are needed while
 * the extension's URL matching, injection order and storage all behave normally.
 *
 * Honest limit: this proves the plugin's own contract end to end — its
 * selectors, its React-input handling, its transition verification, its storage
 * and its rendering. It cannot prove Shopee has not changed ITS markup; only a
 * run against the live site does that. When Shopee changes, this test still
 * passes and the fixture must be refreshed from a real page dump.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const EXT = path.resolve(__dirname, "..");
const FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-offer.html", "utf8");
const URL = "https://affiliate.shopee.co.id/offer/product_offer";

function loadPlaywright() {
  const candidates = [
    "playwright",
    "playwright-core",
    "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core",
    "/usr/local/lib/node_modules/@playwright/cli/node_modules/playwright-core"
  ];
  for (const c of candidates) {
    try { return require(c); } catch (_) { /* try the next location */ }
  }
  return null;
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) {
    // A missing browser must not be reported as a passing test.
    console.log("BROWSER E2E DILEWATI — playwright tidak terpasang.");
    console.log("  pasang: npm install -g @playwright/cli@latest");
    process.exit(0);
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rm-e2e-"));
  const ctx = await pw.chromium.launchPersistentContext(profile, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--window-position=-2400,-2400"   // stay out of the user's way
    ]
  });

  let failed = null;
  try {
    await ctx.route("https://affiliate.shopee.co.id/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURE }));

    const page = ctx.pages()[0] || await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(URL, { waitUntil: "domcontentloaded" });

    // 1. the extension actually injected and built its panel
    await page.waitForSelector(".rm-panel", { timeout: 20000 });
    await page.waitForSelector(".rm-sl-kwinput", { timeout: 20000 });

    // 2. the running build is the one on disk — the marker that exposed a stale
    //    extension being blamed on broken features
    const statText = await page.textContent(".rm-sl-stat").catch(() => "");
    assert(/ditampilkan/.test(statText || ""),
      "panel yang jalan bukan build terbaru (statistik masih format lama): " + statText);

    // 3. run a real two-keyword bulk scan through the real button
    await page.fill(".rm-sl-kwinput", "tumbler, casing iphone");
    await page.click(".rm-sl-kwscan");

    // The terminal summary is sticky (re-painted after each re-render), so it can
    // be waited for and read reliably. Before that fix it was wiped microseconds
    // after being written and this assertion could only ever be flaky.
    await page.waitForFunction(() => {
      const p = document.querySelector(".rm-sl-progress");
      const t = (p && p.textContent) || "";
      return /Selesai — \d+\/\d+ kata kunci|Dihentikan oleh pengguna|^Gagal|kosong|tidak ditemukan/i.test(t);
    }, { timeout: 120000 });
    const terminal = ((await page.textContent(".rm-sl-progress")) || "").trim();
    assert(/Selesai — 2\/2 kata kunci/.test(terminal),
      "kedua kata kunci harus benar-benar ter-scan, dapat: " + (terminal || "(kosong)"));

    // the scan must also hand control back: button re-enabled, label restored
    const btn = await page.$eval(".rm-sl-kwscan",
      (b) => ({ disabled: b.disabled, label: (b.textContent || "").trim() }));
    assert.strictEqual(btn.disabled, false, "tombol scan tetap disabled setelah selesai");
    assert(/Bulk Scan Keyword/.test(btn.label),
      "label tombol tidak kembali normal: " + btn.label);

    // one scan per keyword actually happened, on top of the initial page scan
    const stat = (await page.textContent(".rm-sl-stat")) || "";
    const scans = (stat.match(/(\d+)\s*scan/) || [])[1];
    // Bulk Scan Keyword now CLEARS the shortlist on start (Fikri: hasil baru tidak
    // boleh nyampur scan lama), so only the 2 keyword scans remain — the initial
    // page scan is wiped.
    assert.strictEqual(scans, "2",
      "auto-clear lalu 2 scan keyword, dapat: " + stat);

    // 4. the lower table must show the LAST batch, not the global ranking
    const head = (await page.textContent(".rm-sl-head")) || "";
    assert(/🔎\s*casing iphone/.test(head),
      "tabel bawah harus fokus ke batch keyword terakhir, dapat: " + head.slice(0, 160));

    const rows = await page.$$eval(".rm-sl-table tbody tr", (trs) =>
      trs.map((tr) => ({
        name: (tr.children[1] && tr.children[1].textContent || "").trim(),
        kw: (tr.children[8] && tr.children[8].textContent || "").trim()
      })));
    assert(rows.length > 0, "batch terakhir tidak menghasilkan baris apa pun");
    assert(rows.every((r) => /casing iphone/i.test(r.name)),
      "ada produk dari batch lain yang bocor ke tampilan batch terakhir: " +
      JSON.stringify(rows.slice(0, 3)));

    // 5. THE BUG FROM THE SCREEN RECORDING: never a URL path in this column.
    // Display strips the internal "cari: " prefix for readability (opsi B), so
    // the column shows the bare keyword — assert it is the keyword, not a path.
    for (const r of rows) {
      assert(!/\/offer|product_off|^\//.test(r.kw),
        "kolom 'Kata kunci' berisi URL path: " + JSON.stringify(r));
      assert(/casing iphone/i.test(r.kw),
        "batch keyword harus berlabel kata kuncinya, dapat: " + JSON.stringify(r));
    }

    // 6. the escape hatch back to the full cumulative shortlist works
    await page.click(".rm-sl-all");
    await page.waitForFunction(() => {
      const h = document.querySelector(".rm-sl-head");
      return h && /Riset Produk/.test(h.textContent || "");
    }, { timeout: 15000 });

    const allRows = await page.$$eval(".rm-sl-table tbody tr", (t) => t.length);
    assert(allRows >= rows.length,
      "seluruh shortlist harus memuat minimal sebanyak batch terakhir");

    // 7. both keyword batches survived under their own labels. Read this from the
    //    rendered full shortlist, not chrome.storage: content scripts live in an
    //    isolated world, so page.evaluate cannot see the extension's globals or
    //    its storage. Going through the UI is also what the user actually sees.
    const labels = await page.$$eval(".rm-sl-table tbody tr", (trs) =>
      [...new Set(trs.map((tr) =>
        (tr.children[8] && tr.children[8].textContent || "").trim()))]);
    assert(labels.some((l) => /^tumbler/.test(l)),
      "batch keyword pertama hilang dari shortlist, label yang ada: " + JSON.stringify(labels));
    assert(labels.some((l) => /^casing iph/.test(l)),
      "batch keyword kedua hilang dari shortlist, label yang ada: " + JSON.stringify(labels));
    assert(!labels.some((l) => /\/offer|product_off/.test(l)),
      "shortlist masih menyimpan URL path sebagai keyword: " + JSON.stringify(labels));

    // 8. no uncaught exception anywhere in the run
    assert.strictEqual(errors.length, 0, "error JS di halaman: " + errors.join(" | "));

    console.log("BROWSER E2E BULK KEYWORD LULUS");
    console.log("  extension inject + panel terbangun: OK");
    console.log("  build yang jalan = build di disk: OK");
    console.log("  2/2 kata kunci ter-scan di DOM nyata: OK");
    console.log("  tabel bawah fokus batch terakhir (" + rows.length + " baris): OK");
    console.log("  label 'cari: …', tanpa URL path: OK");
    console.log("  kembali ke shortlist penuh (" + allRows + " baris): OK");
    console.log("  kedua batch tersimpan terpisah: OK");
  } catch (e) {
    failed = e;
    // A timeout on its own says nothing about what the panel was showing. Dump
    // the state that decides every assertion above, so a failure is diagnosable
    // from the log alone instead of needing the run repeated by hand.
    try {
      const page = ctx.pages()[0];
      const state = await page.evaluate(() => ({
        progress: (document.querySelector(".rm-sl-progress") || {}).textContent || "(tidak ada)",
        head: ((document.querySelector(".rm-sl-head") || {}).textContent || "").slice(0, 150),
        kartu: document.querySelectorAll(".ItemCard__contentSection").length,
        barisShortlist: document.querySelectorAll(".rm-sl-table tbody tr").length,
        adaTombolSemua: !!document.querySelector(".rm-sl-all"),
        kw: [...document.querySelectorAll(".rm-sl-kw")].slice(0, 6).map((n) => n.textContent)
      }));
      console.error("STATE SAAT GAGAL:\n" + JSON.stringify(state, null, 1));
    } catch (_) { console.error("(state tidak bisa dibaca)"); }
  } finally {
    await ctx.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
  if (failed) { console.error("BROWSER E2E GAGAL:", failed.message); process.exit(1); }
})();
