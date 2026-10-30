#!/usr/bin/env node
/* Unit test for src/tiktok.js (v0.9.28): URL parsing, page JSON parsing,
 * max-quality selection, and that the watermarked downloadAddr is never used. */
const assert = require("assert");
const T = require("../src/tiktok.js");

// --- URL extraction / classification
assert.strictEqual(T.extractUrl("cek ini https://vt.tiktok.com/ZSabc12/ mantap"), "https://vt.tiktok.com/ZSabc12/");
assert.strictEqual(T.extractUrl("no link here"), null);
let c = T.classify("https://www.tiktok.com/@gorilloyt/video/7106594312292453675?is_from_webapp=1");
assert.deepStrictEqual([c.kind, c.id, c.user], ["video", "7106594312292453675", "gorilloyt"]);
assert.strictEqual(T.classify("https://vm.tiktok.com/ZMabc/").kind, "short");
assert.strictEqual(T.classify("https://shopee.co.id/product/1/2"), null);

// --- page parsing
const item = {
  id: "7106594312292453675", author: { uniqueId: "gorilloyt" },
  video: {
    width: 576, height: 1024, codecType: "h264", bitrate: 1071120,
    playAddr: "https://cdn/play540", downloadAddr: "https://cdn/WATERMARKED",
    bitrateInfo: [
      { GearName: "normal_540_0", CodecType: "h264", Bitrate: 1071120, PlayAddr: { Width: 576, Height: 1024, UrlList: ["https://cdn/540h264"] } },
      { GearName: "adapt_lower_720_1", CodecType: "h265_hvc1", Bitrate: 640712, PlayAddr: { Width: 720, Height: 1280, UrlList: ["https://cdn/720"] } },
      { GearName: "adapt_lowest_1080_1", CodecType: "h265_hvc1", Bitrate: 1094429, PlayAddr: { Width: 1080, Height: 1920, UrlList: ["https://cdn/1080a", "https://cdn/1080b"] } },
    ],
  },
};
const page = (o) => '<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">' +
  JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.video-detail": o } }) + "</script></html>";
const p = T.parseItem(page({ statusCode: 0, itemInfo: { itemStruct: item } }));
assert.ok(p.item && !p.error);
assert.match(T.parseItem(page({ statusCode: 10204, statusMsg: "item doesn't exist" })).error, /10204/);
assert.match(T.parseItem("<html>nothing</html>").error, /tidak dikenali/);

// --- quality selection
const cands = T.candidates(p.item);
assert.strictEqual(cands[0].height, 1920, "best = 1080p");
assert.deepStrictEqual(cands[0].urls, ["https://cdn/1080a", "https://cdn/1080b"], "all mirrors kept for retry");
assert.ok(cands.every((x) => !x.urls.includes("https://cdn/WATERMARKED")), "watermarked downloadAddr never used");
// same resolution -> h264 preferred over h265 for compatibility
const same = T.candidates({ video: { bitrateInfo: [
  { CodecType: "h265_hvc1", Bitrate: 9, PlayAddr: { Width: 1080, Height: 1920, UrlList: ["h265"] } },
  { CodecType: "h264", Bitrate: 1, PlayAddr: { Width: 1080, Height: 1920, UrlList: ["h264"] } }] } });
assert.strictEqual(same[0].urls[0], "h264");
assert.strictEqual(T.filename(p.item, cands[0]), "tiktok/gorilloyt_7106594312292453675_1080p.mp4");

console.log("TIKTOK UNIT OK — url parsing, page JSON, max-quality pick, no watermark source");
