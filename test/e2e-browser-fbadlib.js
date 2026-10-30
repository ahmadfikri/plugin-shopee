#!/usr/bin/env node
/**
 * REAL-BROWSER test for the Facebook Ad Library downloader (v0.9.29). Needs internet.
 * Real Chromium + the unpacked extension, LIVE facebook.com/ads/library, no login. Proves:
 *   1. a "⬇ Download video HD" button appears on every video ad card,
 *   2. clicking one card saves that ad's HD file (checked: complete, >100KB),
 *   3. "⬇ Semua video HD" saves every remaining video,
 *   4. scrolling a keyword search adds ads from GraphQL (hook works), not just inline JSON.
 * Usage: node test/e2e-browser-fbadlib.js [ad-library-url]
 */
const fs = require("fs");
const path = require("path");
const EXT = path.resolve(__dirname, "..");
const PAGE = process.argv[2] || "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ID&is_targeted_country=false&media_type=all&search_type=page&sort_data[mode]=total_impressions&sort_data[direction]=desc&view_all_page_id=1352652887927310";
const SEARCH = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ID&media_type=video&q=shopee&search_type=keyword_unordered";

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
  if (!pw) { console.log("BROWSER E2E FBADLIB DILEWATI — playwright tidak terpasang."); process.exit(0); }
  const root = path.join(EXT, ".e2e-profiles");
  fs.mkdirSync(root, { recursive: true });
  const profile = fs.mkdtempSync(path.join(root, "rm-fbadlib-"));
  const ctx = await pw.chromium.launchPersistentContext(profile, {
    headless: false, acceptDownloads: true, locale: "id-ID",
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      "--no-first-run", "--no-default-browser-check", "--window-position=-2400,-2400"],
  });
  const kill = setTimeout(() => { console.error("BROWSER E2E FBADLIB GAGAL: timeout 240s"); process.exit(1); }, 240000);
  let code = 0;
  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    const downloads = () => sw.evaluate(() => new Promise((ok) => chrome.downloads.search({ orderBy: ["-startTime"] }, ok)));
    const page = await ctx.newPage();
    await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".rm-fb-dl", { timeout: 45000 });
    await page.waitForTimeout(1500);
    const nBtn = await page.locator(".rm-fb-dl").count();
    const nVid = await page.locator("video").count();
    const bar = await page.locator(".rm-fb-count").innerText();
    console.log("cards with button:", nBtn, "| <video> on page:", nVid, "| bar:", bar);
    if (nBtn < 1 || nBtn < nVid) throw new Error("button missing on some video cards (" + nBtn + " vs " + nVid + ")");
    // v0.9.30 winner signal badge + Top panel
    const sigs = await page.locator(".rm-fb-sig").allInnerTexts();
    console.log("badges:", sigs.length, sigs.slice(0, 3).join(" | "));
    if (sigs.length < nBtn || !sigs.every((t) => /\d+ hari/.test(t))) throw new Error("signal badge missing/invalid");
    await page.locator(".rm-fb-topbtn").click();
    const rows = await page.locator(".rm-fb-top tr").count();
    const head = await page.locator(".rm-fb-top-h").innerText();
    const shop = await page.locator(".rm-fb-top a[href*='shopee']").count();
    console.log("top panel rows:", rows - 1, "| shopee links:", shop, "|", head.slice(0, 60));
    if (rows - 1 < nBtn || shop < 1) throw new Error("top panel incomplete");
    await page.locator(".rm-fb-top .rm-fb-x").click();

    // 2) one card
    await page.locator(".rm-fb-dl").first().click();
    await page.waitForFunction(() => /✅|❌/.test(document.querySelector(".rm-fb-dl").textContent), null, { timeout: 90000 });
    const one = await page.locator(".rm-fb-dl").first().innerText();
    console.log("single card ->", one);
    if (!/✅/.test(one)) throw new Error("single download failed: " + one);

    // 3) all remaining
    await page.locator(".rm-fb-all").click();
    await page.waitForFunction(() => /✅|❌/.test(document.querySelector(".rm-fb-all").textContent), null, { timeout: 150000 });
    console.log("download all ->", await page.locator(".rm-fb-all").innerText());
    // Playwright stores downloads under GUID names, so match on the source URL.
    const items = (await downloads()).filter((d) => /fbcdn\.net\//.test(d.finalUrl || d.url || ""));
    const okItems = items.filter((d) => d.state === "complete" && d.fileSize > 100000);
    let probe = "";
    try {
      probe = require("child_process").execFileSync("ffprobe", ["-v", "error", "-select_streams", "v",
        "-show_entries", "stream=width,height", "-of", "csv=p=0", okItems[0].filename]).toString().trim();
    } catch (_) {}
    for (const d of items) console.log(" ", d.state, d.fileSize, d.error || "");
    if (okItems.length < nBtn) throw new Error("only " + okItems.length + " complete files for " + nBtn + " cards");
    if (probe) {
      console.log("ffprobe first file:", probe);
      const [w, h] = probe.split(",").map(Number);
      if (Math.min(w, h) <= 360) throw new Error("got SD (" + probe + "), expected HD");
    }

    // 4) GraphQL hook: scroll a big search, count must exceed the inline first page
    await page.goto(SEARCH, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".rm-fb-count", { timeout: 45000 });
    const before = await page.evaluate(() => parseInt(document.querySelector(".rm-fb-count").textContent, 10));
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 5000); await page.waitForTimeout(2500); }
    const after = await page.evaluate(() => parseInt(document.querySelector(".rm-fb-count").textContent, 10));
    const btnAfter = await page.locator(".rm-fb-dl").count();
    console.log("scroll: ads", before, "->", after, "| buttons", btnAfter);
    if (!(after > before)) throw new Error("GraphQL ads not captured while scrolling");
    console.log("BROWSER E2E FBADLIB OK — " + okItems.length + " HD files, scroll " + before + "->" + after + " ads");
  } catch (e) {
    console.error("BROWSER E2E FBADLIB GAGAL:", e.message); code = 1;
  } finally { clearTimeout(kill); await ctx.close(); }
  process.exit(code);
})();
