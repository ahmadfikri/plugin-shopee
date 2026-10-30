/* tiktok.js — TikTok video downloader core (v0.9.28).
 *
 * How it works (verified against tiktok.com, Oct 2026):
 *   1. Fetch the video page. It embeds a JSON blob
 *      <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"> whose
 *      __DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct.video
 *      lists every encoded quality in `bitrateInfo[]`.
 *   2. `downloadAddr` is the WATERMARKED file (TikTok burns "@user" in).
 *      `playAddr` and every `bitrateInfo[].PlayAddr` are the clean player
 *      streams. playAddr is usually only 540p; bitrateInfo often has 1080p.
 *   3. We pick the highest resolution in bitrateInfo (tie -> prefer h264 for
 *      compatibility, then higher bitrate).
 *   4. The CDN answers 403 unless the request carries the page's cookies
 *      (tt_chain_token) AND Referer: https://www.tiktok.com/ — background.js
 *      handles both.
 * Note: a logo already baked into the ORIGINAL upload (e.g. a re-post of a
 * video that was itself downloaded with a watermark) cannot be removed. */
(function (global) {
  "use strict";

  const VIDEO_RE = /tiktok\.com\/(?:@([\w.\-]+)|[^/]*)\/(?:video|photo)\/(\d{8,25})/i;
  const SHORT_RE = /^https?:\/\/(?:vm|vt|m)\.tiktok\.com\/[\w\-]+\/?/i;

  // Pull a TikTok URL out of arbitrary pasted text ("cek ini https://vt.tiktok.com/ZSx/ lol").
  function extractUrl(text) {
    const m = String(text || "").match(/https?:\/\/[^\s"'<>]*tiktok\.com\/[^\s"'<>]*/i);
    return m ? m[0].replace(/[),.]+$/, "") : null;
  }

  // -> {kind:"video", id, user, url} | {kind:"short", url} | null
  function classify(url) {
    if (!url) return null;
    const v = url.match(VIDEO_RE);
    if (v) return { kind: "video", id: v[2], user: v[1] || "i",
      url: "https://www.tiktok.com/@" + (v[1] || "i") + "/video/" + v[2] };
    if (SHORT_RE.test(url)) return { kind: "short", url: url };
    return null;
  }

  function parseItem(html) {
    const m = String(html).match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      let d;
      try { d = JSON.parse(m[1]); } catch (_) { return { error: "JSON halaman TikTok rusak" }; }
      const vd = ((d || {}).__DEFAULT_SCOPE__ || {})["webapp.video-detail"];
      if (!vd) return { error: "Halaman bukan halaman video TikTok" };
      if (vd.statusCode && vd.statusCode !== 0)
        return { error: "TikTok menolak (status " + vd.statusCode + (vd.statusMsg ? ": " + vd.statusMsg : "") + ") — video privat/dihapus?" };
      const it = ((vd.itemInfo || {}).itemStruct) || null;
      return it ? { item: it } : { error: "Data video tidak ada di halaman" };
    }
    const s = String(html).match(/<script[^>]+id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
    if (s) {
      try {
        const mod = JSON.parse(s[1]).ItemModule || {};
        const it = mod[Object.keys(mod)[0]];
        if (it) return { item: it };
      } catch (_) {}
    }
    if (/captcha|verify/i.test(html) && html.length < 60000) return { error: "TikTok minta captcha — buka tiktok.com sekali di Chrome lalu coba lagi" };
    return { error: "Format halaman TikTok tidak dikenali (TikTok mungkin ganti struktur)" };
  }

  // All clean (non-watermarked) candidates, best first.
  function candidates(item) {
    const v = (item && item.video) || {};
    const out = [];
    for (const b of v.bitrateInfo || []) {
      const pa = b.PlayAddr || {};
      const urls = (pa.UrlList || []).filter(Boolean);
      if (!urls.length) continue;
      out.push({ urls, width: pa.Width || 0, height: pa.Height || 0,
        codec: String(b.CodecType || ""), bitrate: b.Bitrate || 0, size: pa.DataSize || 0,
        gear: b.GearName || "" });
    }
    if (v.playAddr) out.push({ urls: [v.playAddr], width: v.width || 0, height: v.height || 0,
      codec: String(v.codecType || "h264"), bitrate: v.bitrate || 0, size: 0, gear: "playAddr" });
    const h264 = (c) => /h264|avc/i.test(c.codec) ? 1 : 0;
    out.sort((a, b) => (b.width * b.height - a.width * a.height) || (h264(b) - h264(a)) || (b.bitrate - a.bitrate));
    return out;
  }

  function filename(item, best) {
    const user = String(((item || {}).author || {}).uniqueId || (item || {}).author || "tiktok").replace(/[^\w.\-]/g, "_");
    const id = String((item || {}).id || Date.now());
    const h = best && best.height ? "_" + Math.min(best.width || best.height, best.height) + "p" : "";
    return "tiktok/" + user + "_" + id + h + ".mp4";
  }

  global.RMTikTok = { extractUrl, classify, parseItem, candidates, filename };
  if (typeof module !== "undefined" && module.exports) module.exports = global.RMTikTok;
})(typeof self !== "undefined" ? self : this);
