#!/usr/bin/env node
/**
 * REAL-BROWSER end-to-end test for the product drill-down modal.
 *
 * Real Chromium + real extension on the keyword fixture. The historical
 * regression here was that opening the detail modal (or its enrich re-render)
 * removed the whole panel, blanking the shortlist the user was working in — the
 * "one panel, one render" note in content.js exists because of it. This proves:
 *   * clicking a product name opens the modal,
 *   * the modal shows that product's name and price,
 *   * the panel SURVIVES while the modal is open,
 *   * closing via ✕ and via backdrop click both work and leave the panel intact.
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

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log("BROWSER E2E MODAL DILEWATI — playwright tidak terpasang."); process.exit(0); }

  // Profil browser TIDAK boleh di $KIROCREW_SCRATCH: sandbox menolak lstat pada
  // direktori induknya, dan Playwright men-stat rantai path user-data-dir saat
  // launch — akibatnya Chromium start tapi koneksi CDP tidak pernah selesai
  // (timeout 180s yang terlihat seperti "semua test browser rusak"). Pakai
  // direktori di dalam repo yang bisa di-stat penuh.
  const PROFILE_ROOT = path.join(EXT, ".e2e-profiles");
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(PROFILE_ROOT, "rm-modal-"));
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
    await page.waitForSelector(".rm-panel .rm-table .rm-drill", { timeout: 20000 });

    const firstName = (await page.textContent(".rm-panel .rm-table tbody tr .rm-drill")).trim();

    // open the modal
    await page.click(".rm-panel .rm-table tbody tr .rm-drill");
    await page.waitForSelector(".rm-modal-bg", { timeout: 10000 });

    // panel must still exist while modal is open (the blanking regression)
    assert(await page.$(".rm-panel"), "panel hilang saat modal dibuka (regresi blanking)");

    // modal shows this product's identity
    const modalHead = (await page.textContent(".rm-modal-head")) || "";
    const cleanName = firstName.replace(/🔍|↕|↑|↓/g, "").trim().slice(0, 20);
    assert(modalHead.includes(cleanName.slice(0, 10)),
      "judul modal tidak cocok produk yang diklik: '" + modalHead + "' vs '" + cleanName + "'");
    const body = (await page.textContent(".rm-modal-body")) || "";
    assert(/Rp/.test(body), "modal tidak menampilkan harga: " + body.slice(0, 80));

    // close via ✕
    await page.click(".rm-modal-x");
    await page.waitForFunction(() => !document.querySelector(".rm-modal-bg"), { timeout: 10000 });
    assert(await page.$(".rm-panel"), "panel ikut hilang setelah menutup modal via ✕");

    // reopen, close via backdrop click
    await page.click(".rm-panel .rm-table tbody tr .rm-drill");
    await page.waitForSelector(".rm-modal-bg", { timeout: 10000 });
    await page.click(".rm-modal-bg", { position: { x: 5, y: 5 } });   // click outside inner modal
    await page.waitForFunction(() => !document.querySelector(".rm-modal-bg"), { timeout: 10000 });
    assert(await page.$(".rm-panel"), "panel hilang setelah menutup modal via backdrop");

    // no leftover modals stacked up
    const leftover = await page.$$eval(".rm-modal-bg", (n) => n.length);
    assert.strictEqual(leftover, 0, "ada modal tersisa menumpuk: " + leftover);

    // ---- v0.9.27: WITH the real snapshot the drill-down is the decision panel ----
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });
    const SNAP = JSON.parse(require("fs").readFileSync(require("path").join(EXT, "export", "performance-snapshot.json"), "utf8"));
    await sw.evaluate((x) => new Promise((r) => chrome.storage.local.set({ rm_perf: x }, r)), SNAP);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-panel .rm-table .rm-drill", { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.click(".rm-panel .rm-table tbody tr .rm-drill");
    await page.waitForSelector(".rm-modal-bg.rm-pp-root .rm-pp-action", { timeout: 10000 });
    await page.waitForTimeout(1200);   // let the enriched detail replace the loading panel
    const pp = await page.evaluate(() => {
      const m = document.querySelector(".rm-modal-bg.rm-pp-root");
      return { n: document.querySelectorAll(".rm-modal-bg").length,
               action: (m.querySelector(".rm-pp-action") || {}).textContent || "",
               body: m.textContent, svg: !!m.querySelector(".rm-pp-svg") };
    });
    assert.strictEqual(pp.n, 1, "drill-down menumpuk: " + pp.n);
    assert(/IKLANKAN|LAYAK COBA|UJI KECIL|HATI-HATI|LEWATI/.test(pp.action), "vonis kosong: " + pp.action);
    assert(pp.svg && /Prediksi ROAS/.test(pp.body) && /Max CPC Meta/.test(pp.body), "panel keputusan tidak lengkap");
    assert(!/\bNaN\b|undefined/.test(pp.body), "NaN/undefined di drill-down");
    await page.click(".rm-modal-bg", { position: { x: 5, y: 5 } });
    await page.waitForFunction(() => !document.querySelector(".rm-modal-bg"), { timeout: 10000 });
    assert(await page.$(".rm-panel"), "panel hilang setelah menutup drill-down");

    assert.strictEqual(errors.length, 0, "error JS: " + errors.join(" | "));

    console.log("BROWSER E2E MODAL LULUS (dengan snapshot: " + pp.action.trim() + ")");
    console.log("  modal terbuka dari baris tabel: OK");
    console.log("  judul + harga produk terbaca: OK");
    console.log("  panel bertahan saat modal terbuka: OK");
    console.log("  tutup via ✕ dan via backdrop, panel utuh: OK");
  } catch (e) {
    failed = e;
    try {
      const page = ctx.pages()[0];
      const st = await page.evaluate(() => ({
        adaPanel: !!document.querySelector(".rm-panel"),
        adaModal: !!document.querySelector(".rm-modal-bg"),
        head: (document.querySelector(".rm-modal-head") || {}).textContent || "(tidak ada)"
      }));
      console.error("STATE SAAT GAGAL:\n" + JSON.stringify(st, null, 1));
    } catch (_) {}
  } finally {
    await ctx.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
  if (failed) { console.error("BROWSER E2E MODAL GAGAL:", failed.message); process.exit(1); }
})();
