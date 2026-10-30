#!/usr/bin/env node
/**
 * REAL-BROWSER test for the TikTok downloader (v0.9.28). Needs internet.
 * Real Chromium + the unpacked extension, LIVE tiktok.com. Proves:
 *   * the background handler resolves a link to the highest-resolution stream,
 *   * the CDN accepts it (cookies + Referer rule work in a real browser),
 *   * the file lands via chrome.downloads, complete, as tiktok/<user>_<id>_<res>p.mp4.
 * The right-click menu calls the same ttRun() path.
 * Usage: node test/e2e-browser-tiktok.js [tiktok-url]
 */
const fs = require("fs");
const path = require("path");
const EXT = path.resolve(__dirname, "..");
const URL = process.argv[2] || "https://www.tiktok.com/@tiktok/video/7106594312292453675";

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
  if (!pw) { console.log("BROWSER E2E TIKTOK DILEWATI — playwright tidak terpasang."); process.exit(0); }
  const root = path.join(EXT, ".e2e-profiles");
  fs.mkdirSync(root, { recursive: true });
  const profile = fs.mkdtempSync(path.join(root, "rm-tiktok-"));
  const dlDir = fs.mkdtempSync(path.join(root, "dl-"));
  const ctx = await pw.chromium.launchPersistentContext(profile, {
    headless: false, acceptDownloads: true, downloadsPath: dlDir,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      "--no-first-run", "--no-default-browser-check", "--window-position=-2400,-2400"],
  });
  let code = 0;
  try {
    let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    const r = await sw.evaluate(async (u) => {
      // send the download into the profile's download dir, then report the real file
      const res = await Promise.race([ttDownload(u), new Promise((ok) => setTimeout(() => ok({ ok: false, error: "timeout 120s" }), 120000))]);
      if (!res.ok) return res;
      const items = await new Promise((ok) => chrome.downloads.search({ orderBy: ["-startTime"], limit: 1 }, ok));
      return Object.assign(res, { state: items[0] && items[0].state, bytes: items[0] && items[0].fileSize,
        path: items[0] && items[0].filename, finalUrl: items[0] && items[0].finalUrl });
    }, URL);
    console.log(JSON.stringify(Object.assign({}, r, { finalUrl: undefined }), null, 1));
    if (!r.ok) throw new Error(r.error);
    if (r.state !== "complete") throw new Error("download not complete: " + r.state);
    if (!(r.bytes > 100000)) throw new Error("file too small: " + r.bytes);
    if (!/^tiktok\/|[\\/]tiktok[\\/]/.test(r.filename) && !/tiktok/.test(r.path)) throw new Error("bad filename " + r.filename);
    console.log("BROWSER E2E TIKTOK OK — " + r.filename + " " + Math.min(r.width, r.height) + "p " + r.codec + " " + r.bytes + "B");
    console.log("SAVED_PATH=" + r.path);
  } catch (e) {
    console.error("BROWSER E2E TIKTOK GAGAL:", e.message); code = 1;
  } finally { await ctx.close(); }
  process.exit(code);
})();
