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

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rm-modal-"));
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

    assert.strictEqual(errors.length, 0, "error JS: " + errors.join(" | "));

    console.log("BROWSER E2E MODAL LULUS");
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
