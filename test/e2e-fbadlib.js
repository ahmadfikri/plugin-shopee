#!/usr/bin/env node
/* Unit test for src/fbadlib.js (v0.9.29) on REAL Ad Library payloads captured
 * 30 Oct 2026: the inline JSON of page 1352652887927310 (Beyond.shopcart, 6 ads)
 * and one GraphQL scroll response from a keyword search. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const A = require("../src/fbadlib.js");
const fx = (f) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");

// --- URL / card label helpers
assert.ok(A.isLibraryUrl("https://www.facebook.com/ads/library/?active_status=active&view_all_page_id=1352652887927310"));
assert.ok(!A.isLibraryUrl("https://www.facebook.com/somepage"));
assert.strictEqual(A.cardIdFromText("Aktif\nID Galeri: 1791682218708346\nMulai"), "1791682218708346");
assert.strictEqual(A.cardIdFromText("Library ID: 2427314364463820"), "2427314364463820");
assert.strictEqual(A.countCardIds("ID Galeri: 1111111 ... ID Galeri: 2222222"), 2);

// --- inline JSON (first page load)
const inl = A.extractFromText(fx("fbadlib-inline.json"));
assert.strictEqual(inl.length, 6, "6 ads on Beyond.shopcart page");
for (const ad of inl) {
  assert.strictEqual(ad.pageId, "1352652887927310");
  assert.strictEqual(ad.pageName, "Beyond.shopcart");
  assert.ok(ad.videos.length >= 1, "ad " + ad.id + " has a video");
  assert.match(ad.videos[0].hd, /^https:\/\/video\.[^/]+\.fbcdn\.net\/.+\.mp4\?/, "HD url");
  assert.notStrictEqual(ad.videos[0].hd, ad.videos[0].sd, "HD and SD differ");
  assert.match(ad.startDate, /^2026-\d\d-\d\d$/);
}
assert.ok(inl.some((a) => /s\.shopee\.co\.id/.test(a.linkUrl)), "Shopee link kept");
assert.ok(inl.some((a) => /BELI DI SINI/.test(a.body)), "ad copy kept");

// --- GraphQL scroll response
const gq = A.extractFromText(fx("fbadlib-graphql.txt"));
assert.strictEqual(gq.length, 9, "graphql scroll page = 9 distinct ads (grep-verified)");
assert.ok(gq.filter((a) => a.videos.length).length >= 5, "graphql ads with video");
// "for (;;);" prefix and multi-doc streams
assert.strictEqual(A.extractFromText("for (;;);" + fx("fbadlib-inline.json")).length, 6);
const two = '{"a":{"ad_archive_id":"1","snapshot":{"page_name":"X","videos":[{"video_hd_url":"https://video.x.fbcdn.net/a.mp4?h","video_sd_url":"https://video.x.fbcdn.net/a.mp4?s"}]}}}\n' +
  '{"b":{"ad_archive_id":"2","snapshot":{"page_name":"X","cards":[{"video_hd_url":"","video_sd_url":"https://video.x.fbcdn.net/c.mp4?s"}],"videos":[]}}}';
const t = A.extractFromText(two);
assert.deepStrictEqual(t.map((a) => a.id), ["1", "2"]);
assert.strictEqual(t[1].videos[0].hd, "", "carousel card with only SD");

// --- download plan: HD first, SD fallback, safe file names
const d = A.downloadsFor(inl[0]);
assert.strictEqual(d[0].url, inl[0].videos[0].hd);
assert.strictEqual(d[0].fallback, inl[0].videos[0].sd);
assert.strictEqual(d[0].filename, "fbads/Beyond.shopcart/Beyond.shopcart_" + inl[0].id + "_hd.mp4");
assert.strictEqual(A.downloadsFor(t[1])[0].filename, "fbads/X/X_2_sd.mp4");
assert.ok(!/[\s/\\:*?"<>|]/.test(A.slug("Toko Ku: \"Best\"/Shop")), "slug is filename safe");
// dedupe the same ad seen twice (inline + graphql)
const raw = JSON.parse(fx("fbadlib-inline.json"));
assert.strictEqual(A.extractAds({ a: raw, b: raw }).length, 6, "same ad twice -> counted once");

console.log("FBADLIB UNIT OK — " + inl.length + " inline ads, " + gq.length + " graphql ads, HD-first plan");
