#!/usr/bin/env node
/**
 * REAL-BROWSER test for v0.9.31 Ad Library features, on the LIVE Ad Library page
 * of Beyond.shopcart (needs internet). Shopee product pages are served from the
 * product fixture (route) so the test never hits real Shopee, and DeepSeek is
 * mocked. Proves:
 *   2. "🔍 Analisa produk TERBUKTI" opens the competitor's Shopee link in a
 *      background tab, the plugin's own product panel reports a verdict, and the
 *      "Vonis kita" column fills in; the tab is closed afterwards,
 *   3. the tracker remembers the page: a seeded ad that is no longer shown is
 *      listed as "tidak terlihat lagi", today's ads count as new,
 *   4. "✍️" brief: prompt carries no price, output shows in its own box, copy-able.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const EXT = path.resolve(__dirname, "..");
const PAGE = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ID&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=1352652887927310";
const FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-product.html", "utf8");
const SNAP = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "performance-snapshot-2026-10-21.json"), "utf8"));

function loadPlaywright() {
  for (const p of ["playwright", "playwright-core",
    "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core",
    "/usr/local/lib/node_modules/@playwright/cli/node_modules/playwright-core"]) {
    try { return require(p); } catch (_) {}
  }
  return null;
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log("BROWSER E2E FBADLIB2 DILEWATI — playwright tidak terpasang."); process.exit(0); }
  const root = path.join(EXT, ".e2e-profiles"); fs.mkdirSync(root, { recursive: true });
  const ctx = await pw.chromium.launchPersistentContext(fs.mkdtempSync(path.join(root, "rm-fb2-")), {
    headless: false, locale: "id-ID",
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      "--no-first-run", "--no-default-browser-check", "--window-position=-2400,-2400"] });
  const kill = setTimeout(() => { console.error("BROWSER E2E FBADLIB2 GAGAL: timeout"); process.exit(1); }, 240000);
  let code = 0;
  try {
    // s.shopee short link -> 302 to a product URL; product URL -> fixture
    await ctx.route("https://s.shopee.co.id/**", (r) => r.fulfill({ status: 302, headers: { location: "https://shopee.co.id/product/123/456" } }));
    await ctx.route("https://shopee.co.id/**", (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURE }));
    await ctx.route("https://down-id.img.susercontent.com/**", (r) => r.fulfill({ status: 404, body: "" }));
    let prompt = "";
    await ctx.route("https://api.deepseek.com/**", (r) => {
      prompt = JSON.parse(r.request().postData()).messages[0].content;
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content:
        "1. ANGLE: tas muat banyak untuk kerja\n2. HOOK: Tas kecil tapi muat laptop?\nHarga cuma Rp99rb\n3. NASKAH 10 DETIK: ...\n5. CTA: cek link di bawah" } }] }) });
    });
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    // tracker: pretend we visited this page 2 days ago and saw one extra ad
    await sw.evaluate((s) => new Promise((r) => chrome.storage.local.set({ rm_perf: s,
      rm_config: { ai: { enabled: true, apiKey: "test-key" } },
      rm_fbadlib_track: { "1352652887927310": { lastVisit: "2026-10-29", page: "Beyond.shopcart",
        ads: { "999000111": { firstSeen: "2026-10-20", lastSeen: "2026-10-29", days: 10, page: "Beyond.shopcart",
          body: "IKLAN LAMA yang sudah berhenti", link: "https://s.shopee.co.id/zzz", gone: false } } } } }, r)), SNAP);

    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".rm-fb-topbtn", { timeout: 45000 });
    await page.waitForTimeout(2000);
    await page.click(".rm-fb-topbtn");

    // 3) tracker
    const tr = await page.textContent(".rm-fb-track");
    console.log("tracker:", tr.replace(/\s+/g, " ").slice(0, 160));
    assert.match(tr, /1 tidak terlihat lagi/); assert.match(tr, /IKLAN LAMA/); assert.match(tr, /6 iklan baru/);
    await page.waitForTimeout(2000);
    const stored = await sw.evaluate(() => new Promise((r) => chrome.storage.local.get("rm_fbadlib_track", (o) => r(o.rm_fbadlib_track))));
    const st = stored["1352652887927310"];
    assert.ok(st.ads["999000111"].gone && Object.keys(st.ads).length === 7, "store updated: gone ad + 6 current");
    console.log("PASS  3 pelacak: 6 baru, 1 hilang, tersimpan");

    // 2) analysis of TERBUKTI links
    const tabsBefore = ctx.pages().length;
    await page.click(".rm-fb-analyze");
    await page.waitForFunction(() => [...document.querySelectorAll(".rm-fb-top .rm-fb-v")].length >= 1, null, { timeout: 90000 });
    const v = await page.$$eval(".rm-fb-top .rm-fb-v", (els) => els.map((e) => e.textContent));
    console.log("vonis:", v.join(" | "));
    assert.ok(v.some((x) => /IKLANKAN|LAYAK COBA|UJI KECIL|HATI-HATI|LEWATI/.test(x)), "real verdict from product panel");
    await page.waitForTimeout(1500);
    assert.strictEqual(ctx.pages().length, tabsBefore, "background tab closed");
    console.log("PASS  2 analisa TERBUKTI: vonis panel produk masuk ke tabel, tab ditutup");

    // 4) brief
    await page.click(".rm-fb-top button[data-brief]");
    await page.waitForFunction(() => { const t = document.querySelector(".rm-fb-brief textarea"); return t && /ANGLE/.test(t.value); }, null, { timeout: 30000 });
    const brief = await page.$eval(".rm-fb-brief textarea", (t) => t.value);
    const quoted = prompt.split('"""')[1] || "";
    assert.ok(!/Rp\s?\d|diskon|promo|termurah/i.test(quoted), "no price sent to model: " + quoted.match(/.{0,40}(Rp\s?\d|diskon|promo|termurah).{0,40}/i));
    assert.ok(!/Rp|Harga/i.test(brief), "price line removed from output: " + brief);
    assert.match(prompt, /JANGAN sebut harga/);
    console.log("PASS  4 brief: tanpa harga di prompt & hasil, tampil di kotak sendiri");
    if (errors.length) throw new Error("page errors: " + errors.join(" | "));
    console.log("BROWSER E2E FBADLIB2 OK");
  } catch (e) { console.error("BROWSER E2E FBADLIB2 GAGAL:", e.message); code = 1; }
  finally { clearTimeout(kill); await ctx.close(); }
  process.exit(code);
})();
