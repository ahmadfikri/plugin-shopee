#!/usr/bin/env node
/**
 * REAL-BROWSER regression for "Caption harus dipencet beberapa kali" (v0.9.31).
 *
 * Shopee product pages lazy-load recommendation cards (ItemCard) while you
 * read/scroll. Each new card changed the page signature, run() rebuilt the
 * panel, and the caption that DeepSeek returned a few seconds later was written
 * into the REMOVED panel — invisible. This test reproduces exactly that:
 *   * DeepSeek is mocked with a 3 s delay (route on api.deepseek.com),
 *   * while the request is in flight, recommendation cards are injected,
 *   * ONE click on ✨ Caption must show the caption in the visible panel,
 *   * double-clicking must not fire two requests,
 *   * an API error must show inline in the panel (no alert needed).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const EXT = path.resolve(__dirname, "..");
const FIXTURE = fs.readFileSync(__dirname + "/fixtures/shopee-product.html", "utf8");
const URL = "https://shopee.co.id/product/123/456";
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
  if (!pw) { console.log("BROWSER E2E CAPTION DILEWATI — playwright tidak terpasang."); process.exit(0); }
  const root = path.join(EXT, ".e2e-profiles");
  fs.mkdirSync(root, { recursive: true });
  const ctx = await pw.chromium.launchPersistentContext(fs.mkdtempSync(path.join(root, "rm-cap-")), {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      "--no-first-run", "--no-default-browser-check", "--window-position=-2400,-2400"] });
  const kill = setTimeout(() => { console.error("BROWSER E2E CAPTION GAGAL: timeout"); process.exit(1); }, 150000);
  let code = 0;
  var calls = 0, mode;
  try {
    await ctx.route("https://shopee.co.id/**", (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURE }));
    await ctx.route("https://down-id.img.susercontent.com/**", (r) => r.fulfill({ status: 404, body: "" }));
    mode = "ok";
    await ctx.route("https://api.deepseek.com/**", async (r) => {
      calls++;
      await new Promise((ok) => setTimeout(ok, 3000));
      if (mode === "err") return r.fulfill({ status: 401, contentType: "application/json", body: '{"error":"bad key"}' });
      r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ choices: [{ message: { content: "Rak ini bikin dapur rapi HOOKUJI\n#fyp #viral #masukberanda" } }] }) });
    });
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    await sw.evaluate((s) => new Promise((r) => chrome.storage.local.set({ rm_perf: s,
      rm_config: { ai: { enabled: true, apiKey: "test-key", affiliateId: "11300901968" } } }, r)), SNAP);

    const page = ctx.pages()[0] || await ctx.newPage();
    const errors = [], dialogs = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rm-pp-root .rm-ai2", { timeout: 20000 });

    // lazy-loaded "produk serupa": append ItemCards every 700 ms for 5 s
    const lazyCards = () => page.evaluate(() => new Promise((done) => {
      let n = 0;
      const t = setInterval(() => {
        const box = document.createElement("div");
        box.className = "shopee-search-item-result__item";
        box.innerHTML = '<div class="ItemCard__contentSection">Produk serupa ' + (n++) + " Rp" + (10000 + n) + "</div>";
        document.body.appendChild(box);
        if (n > 7) { clearInterval(t); done(); }
      }, 700);
    }));

    // 1) one click while the page keeps changing
    await page.click(".rm-pp-root .rm-ai2");
    // impatient double click, 100 ms later, without waiting for the button
    await page.waitForTimeout(100);
    await page.$eval(".rm-pp-root .rm-ai2", (b) => b.click());
    await lazyCards();
    await page.waitForFunction(() => {
      const ta = document.querySelector(".rm-pp-root .rm-out-ta");
      return ta && ta.offsetParent !== null && /HOOKUJI/.test(ta.value);
    }, null, { timeout: 15000 });
    const val = await page.$eval(".rm-pp-root .rm-out-ta", (t) => t.value);
    assert.match(val, /s\.shopee\.co\.id\/an_redir.*affiliate_id=11300901968/, "short-link with default affiliate id");
    assert.strictEqual(calls, 1, "double click must not send 2 requests, got " + calls);
    assert.strictEqual(await page.locator(".rm-pp-root").count(), 1, "exactly one panel");
    console.log("PASS  1 klik -> caption tampil walau halaman lazy-load kartu (1 request)");

    // 2) error shows inline, button recovers
    mode = "err";
    await page.click(".rm-pp-root .rm-ai2");
    await page.waitForFunction(() => /401|gagal/i.test((document.querySelector(".rm-pp-root .rm-out") || {}).textContent || ""),
      null, { timeout: 30000 });
    const btn = (await page.textContent(".rm-pp-root .rm-ai2")).trim();
    assert.match(btn, /Caption/, "button label restored: " + btn);
    assert.strictEqual(dialogs.length, 0, "no alert popups: " + dialogs.join(" | "));
    console.log("PASS  error DeepSeek tampil di panel, tombol pulih, tanpa alert");
    if (errors.length) throw new Error("page errors: " + errors.join(" | "));
    console.log("BROWSER E2E CAPTION OK");
  } catch (e) {
    console.error("BROWSER E2E CAPTION GAGAL:", e.message); code = 1;
    try {
      const pg = ctx.pages()[0];
      console.error("DIAG", JSON.stringify(await pg.evaluate(() => ({
        panels: document.querySelectorAll(".rm-pp-root").length,
        btn: (document.querySelector(".rm-pp-root .rm-ai2") || {}).textContent,
        out: ((document.querySelector(".rm-pp-root .rm-out") || {}).textContent || "").slice(0, 200),
        ta: ((document.querySelector(".rm-out-ta") || {}).value || "").slice(0, 120),
      }))), "calls=" + (typeof calls !== "undefined" ? calls : "?"));
      const sw2 = ctx.serviceWorkers()[0];
      const log = await sw2.evaluate(() => new Promise((r) => chrome.storage.local.get("rm_activity_log", (o) => r(((o.rm_activity_log || {}).entries || []).slice(-12)))));
      console.error("LOG", JSON.stringify(log.map((x) => [x.type, JSON.stringify(x.data || x).slice(0, 140)])));
    } catch (e2) { console.error("diag fail", e2.message); }
  } finally { clearTimeout(kill); await ctx.close(); }
  process.exit(code);
})();
