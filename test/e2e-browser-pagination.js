#!/usr/bin/env node
/**
 * REAL-BROWSER test: bulk scan keyword harus MENELUSURI HALAMAN BERIKUTNYA dari
 * keyword yang sama, bukan berhenti di halaman 1.
 *
 * Bug yang dibuktikan (dilaporkan Fikri 2026-09-24, "Selesai — 1/1 kata kunci,
 * total 20 produk … kenapa dia gak search halaman selanjutnya padahal pages-nya
 * ada banyak"): findNextPage() hanya mengenal pagination antd
 * (.ant-pagination-next / aria-label='Next Page'). Halaman Product Offer yang asli
 * memakai pager bernomor polos ("‹ 1 2 3 ›") tanpa kelas antd, jadi findNextPage()
 * mengembalikan null dan loop pagination langsung berhenti — tepat 1 halaman.
 *
 * Fixture shopee-offer.html kini menyediakan pager bernomor NON-antd dengan 3
 * halaman × 8 produk unik per keyword. Test menuntut ketiganya ter-scan.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const EXT = path.resolve(__dirname, "..");
const FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-offer.html", "utf8");
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
  if (!pw) { console.log("BROWSER E2E PAGINATION DILEWATI — playwright tidak terpasang."); process.exit(0); }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rm-pg-"));
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
    page.setDefaultTimeout(180000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-sl-kwinput", { timeout: 20000 });

    // ONE keyword, so every stored product must come from its own pages.
    await page.fill(".rm-sl-kwinput", "tumbler");
    await page.click(".rm-sl-kwscan");

    // Wait for the scan to HAND BACK control (button re-enabled). The progress
    // line is not a reliable signal here: per-page summaries overwrite it.
    await page.waitForFunction(() => {
      const b = document.querySelector(".rm-sl-kwscan");
      return b && !b.disabled && /Bulk Scan Keyword/.test(b.textContent || "");
    }, { timeout: 180000 });

    const terminal = ((await page.textContent(".rm-sl-progress")) || "").trim();
    assert(!/^Gagal/i.test(terminal), "scan gagal: " + terminal);

    // show every row, then count what was actually stored for this keyword
    await page.click(".rm-sl-toggle").catch(() => {});
    await page.waitForFunction(() => {
      const t = document.querySelectorAll(".rm-sl-table tbody tr").length;
      return t > 20;      // collapsed view caps at 20; expanded must exceed it
    }, { timeout: 30000 }).catch(() => {});

    // Authoritative count: the stat line reports what storage actually holds,
    // independent of how many rows the collapsed/expanded view paints.
    const stat = (await page.textContent(".rm-sl-stat")) || "";
    const stored = Number((stat.match(/(\d+)\s*total/) || [])[1] || 0);
    assert(stored >= 24,
      "crawl berhenti sebelum semua halaman: harus >=24 produk (3 halaman x 8), dapat " +
      stored + " -> " + stat);

    const names = await page.$$eval(".rm-sl-table tbody tr", (trs) =>
      trs.map((tr) => (tr.children[1] && tr.children[1].textContent || "").trim()));

    // products from page 2 and 3 carry higher indices (produk 9.. / produk 17..)
    const idx = names
      .map((n) => (n.match(/produk\s+(\d+)/) || [])[1])
      .filter(Boolean).map(Number);
    assert(idx.some((n) => n > 8), "tidak ada produk dari halaman 2: " + JSON.stringify(idx));
    assert(idx.some((n) => n > 16), "tidak ada produk dari halaman 3: " + JSON.stringify(idx));

    // every row belongs to the scanned keyword — no stale batch leaked in
    assert(names.every((n) => /tumbler/i.test(n)),
      "ada produk bukan dari keyword ini: " + JSON.stringify(names.slice(0, 5)));

    assert.strictEqual(errors.length, 0, "error JS di halaman: " + errors.join(" | "));

    console.log("BROWSER E2E PAGINATION LULUS");
    console.log("  pager bernomor non-antd dikenali: OK");
    console.log("  3 halaman keyword ter-scan (" + stored + " produk tersimpan): OK");
    console.log("  produk halaman 2 & 3 benar-benar tersimpan: OK");
  } catch (e) {
    failed = e;
    try {
      const page = ctx.pages()[0];
      const st = await page.evaluate(() => ({
        progress: (document.querySelector(".rm-sl-progress") || {}).textContent || "(tidak ada)",
        baris: document.querySelectorAll(".rm-sl-table tbody tr").length,
        pagerAda: !!document.getElementById("pager"),
        pagerTeks: ((document.getElementById("pager") || {}).textContent || "").trim(),
        kartu: document.querySelectorAll(".ItemCard__contentSection").length
      }));
      console.error("STATE SAAT GAGAL:\n" + JSON.stringify(st, null, 1));
    } catch (_) {}
  } finally {
    await ctx.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
  if (failed) { console.error("BROWSER E2E PAGINATION GAGAL:", failed.message); process.exit(1); }
})();
