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

// --- winner signal (v0.9.30): days running from start_date..end_date, variants
const first = inl.find((a) => a.id === "1791682218708346"); // start 16 Okt, last seen 30 Okt
assert.strictEqual(first.days, 15, "16..30 Okt inclusive = 15 hari");
assert.strictEqual(A.signal(first).tier, "TERBUKTI");
const old = gq.find((a) => a.days > 300);
assert.ok(old, "graphql has a long-running ad (start Okt 2025)");
const multi = gq.find((a) => a.variants === 6);
assert.ok(multi && A.signal(multi).scaling, "6 variasi -> SCALING");
assert.strictEqual(A.signal({ days: 3, variants: 1 }).tier, "BARU");
assert.strictEqual(A.signal({ days: 9, variants: 1 }).tier, "MENJANJIKAN");
assert.ok(A.signal({ days: 10, variants: 5 }).score > A.signal({ days: 10, variants: 1 }).score, "variasi menaikkan skor");
const ranked = A.rank(gq);
assert.ok(ranked.every((a, i) => i === 0 || A.signal(ranked[i - 1]).score >= A.signal(a).score), "rank sorted desc");
assert.strictEqual(ranked[0].id, old.id, "ad running >300 days ranks first");

// --- v0.9.31 competitor tracker
const t1 = A.trackDiff({}, inl.slice(0, 4), "2026-10-30");
assert.ok(t1.firstVisit && t1.baru.length === 4 && t1.hilang.length === 0);
const t2 = A.trackDiff(t1.store, inl.slice(2, 6), "2026-10-31");
assert.ok(!t2.firstVisit);
assert.deepStrictEqual(t2.baru.sort(), [inl[4].id, inl[5].id].sort(), "2 new ads");
assert.deepStrictEqual(t2.hilang.sort(), [inl[0].id, inl[1].id].sort(), "2 gone ads");
assert.strictEqual(t2.store[inl[2].id].firstSeen, "2026-10-30", "firstSeen kept");
assert.strictEqual(t2.store[inl[0].id].goneSince, "2026-10-31");
assert.match(t2.store[inl[0].id].link, /s\.shopee\.co\.id/, "gone ad keeps its Shopee link");
const t3 = A.trackDiff(t2.store, inl.slice(0, 6), "2026-11-01");
assert.strictEqual(t3.store[inl[0].id].gone, false, "ad seen again is no longer gone");

// --- v0.9.31 creative brief: no price ever reaches the model or the output
const priced = Object.assign({}, inl[0], { body: "Cuma Rp49.900! Harga termurah, diskon 50% promo hari ini. Tas cantik muat banyak https://s.shopee.co.id/abc" });
const bp = A.briefPrompt(priced);
const quoted = bp.split('"""')[1];
assert.ok(!/Rp|49\.900|termurah|diskon|promo|https/i.test(quoted), "ad text sanitized: " + quoted);
assert.match(quoted, /Tas cantik muat banyak/);
assert.match(bp, /JANGAN sebut harga/);
assert.match(bp, /10 DETIK/);
const cb = A.cleanBrief("1. ANGLE: **muat banyak**\nHook: harga cuma Rp50rb\n2. HOOK: Tas ini muat laptop?");
assert.ok(!/harga|Rp/i.test(cb) && /muat banyak/.test(cb) && !/\*\*/.test(cb), "price line dropped: " + cb);

console.log("FBADLIB UNIT OK — " + inl.length + " inline ads, " + gq.length + " graphql ads, HD-first plan");
