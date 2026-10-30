/* offscreen.js — fetch a video into a blob: URL for background.js (v0.9.29).
 * Why: some CDNs (TikTok) answer chrome.downloads with 403 but accept fetch()
 * from the extension. A service worker cannot create blob: URLs, an offscreen
 * document can. background.js then hands the blob: URL to chrome.downloads. */
"use strict";
const live = new Map(); // blobUrl -> true

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (!msg || msg.target !== "offscreen") return false;
  if (msg.type === "fetch-blob") {
    (async () => {
      try {
        const r = await fetch(msg.url, { credentials: "include" });
        if (!r.ok) return reply({ ok: false, error: "HTTP " + r.status });
        const b = await r.blob();
        if (b.size < 10000) return reply({ ok: false, error: "file terlalu kecil (" + b.size + "B)" });
        const u = URL.createObjectURL(b);
        live.set(u, true);
        reply({ ok: true, blobUrl: u, size: b.size, type: b.type });
      } catch (e) { reply({ ok: false, error: e.message }); }
    })();
    return true;
  }
  if (msg.type === "revoke") { try { URL.revokeObjectURL(msg.blobUrl); } catch (_) {} live.delete(msg.blobUrl); reply({ ok: true, left: live.size }); return false; }
  return false;
});
