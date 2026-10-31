/* background.js — service worker. Its only job: perform the downloads for
 * "🎞 Gahwa Pack" (content scripts cannot call chrome.downloads, and the
 * browser's own downloader is not blocked by CORS on Shopee's image CDN).
 * Files land in the user's Downloads folder under gahwa/<folder>/. */
"use strict";

function dl(opts) {
  return new Promise((resolve) => {
    chrome.downloads.download(Object.assign({ conflictAction: "uniquify", saveAs: false }, opts), (id) => {
      resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : { ok: true, id });
    });
  });
}

/* ---------------- TikTok downloader (v0.9.28) ----------------
 * Right-click a TikTok link / page / selected link -> "⬇ Download TikTok
 * (kualitas max, tanpa watermark)". Also reachable from the popup paste box.
 * Core parsing lives in src/tiktok.js (shared with node tests). */
try { importScripts("tiktok.js"); } catch (e) { console.warn("tiktok.js gagal dimuat", e); }

const TT_MENU = "rm-tiktok-dl";
const TT_CDN = ["tiktok.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokv.com",
  "byteoversea.com", "ibytedtos.com", "muscdn.com"];

function ttSetupMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: TT_MENU, title: "⬇ Download TikTok (kualitas max, tanpa watermark)",
      contexts: ["link", "page", "video", "selection"],
      documentUrlPatterns: ["<all_urls>"] });
  });
}
chrome.runtime.onInstalled.addListener(ttSetupMenu);
chrome.runtime.onStartup.addListener(ttSetupMenu);

// The video CDN 403s without Referer. Fetch/downloads cannot set Referer, so a
// SESSION rule adds it — only to requests made by the extension itself
// (tabId -1), never to the user's normal browsing.
async function ttEnsureRefererRule() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [9101],
    addRules: [{ id: 9101, priority: 1,
      action: { type: "modifyHeaders", requestHeaders: [
        { header: "Referer", operation: "set", value: "https://www.tiktok.com/" }] },
      condition: { requestDomains: TT_CDN, tabIds: [-1],
        resourceTypes: ["xmlhttprequest", "media", "other", "main_frame", "sub_frame"] } }]
  });
}

function ttBadge(text, color) {
  try { chrome.action.setBadgeBackgroundColor({ color: color || "#ee4d2d" }); chrome.action.setBadgeText({ text: text || "" }); } catch (_) {}
}
function ttNotify(title, message) {
  try { chrome.notifications.create({ type: "basic", iconUrl: chrome.runtime.getURL("assets/icon128.png"), title, message }); } catch (_) {}
}

// v0.9.29 fix: a fast 403 can finish BEFORE the onChanged listener is attached,
// which left the old version waiting forever. Now: listen, then also poll the
// current state, and give up after `ms`.
function ttWaitDownload(id, ms) {
  return new Promise((resolve) => {
    let over = false;
    const finish = (r) => { if (over) return; over = true; chrome.downloads.onChanged.removeListener(on); clearInterval(poll); clearTimeout(to); resolve(r); };
    const judge = (state, err) => {
      if (state === "complete") finish({ ok: true });
      else if (state === "interrupted") finish({ ok: false, error: err || "interrupted" });
    };
    const on = (d) => { if (d.id === id && d.state) judge(d.state.current, d.error && d.error.current); };
    chrome.downloads.onChanged.addListener(on);
    const check = () => chrome.downloads.search({ id }, (it) => { if (it && it[0]) judge(it[0].state, it[0].error); });
    const poll = setInterval(check, 1500);
    const to = setTimeout(() => finish({ ok: false, error: "timeout" }), ms || 180000);
    check();
  });
}

/* ---------------- shared save helpers (v0.9.29) ---------------- */
async function ensureOffscreen() {
  if (chrome.offscreen.hasDocument && await chrome.offscreen.hasDocument()) return;
  try {
    await chrome.offscreen.createDocument({ url: "src/offscreen.html", reasons: ["BLOBS"],
      justification: "Buat blob URL video supaya bisa disimpan lewat chrome.downloads" });
  } catch (e) { if (!/single offscreen|already/i.test(e.message)) throw e; }
}

function startDownload(url, filename) {
  return new Promise((r) => chrome.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false },
    (i) => r(chrome.runtime.lastError ? { id: null, error: chrome.runtime.lastError.message } : { id: i })));
}

// chrome.downloads straight from the CDN (works for pre-signed fbcdn URLs).
async function saveDirect(url, filename) {
  const s = await startDownload(url, filename);
  if (s.id == null) return { ok: false, error: s.error };
  const d = await ttWaitDownload(s.id);
  if (!d.ok) { try { chrome.downloads.erase({ id: s.id }); } catch (_) {} }
  return d;
}

// fetch() in the offscreen document -> blob: URL -> chrome.downloads.
async function saveViaBlob(url, filename) {
  await ensureOffscreen();
  const b = await chrome.runtime.sendMessage({ target: "offscreen", type: "fetch-blob", url });
  if (!b || !b.ok) return { ok: false, error: (b && b.error) || "offscreen tidak merespon" };
  const s = await startDownload(b.blobUrl, filename);
  const d = s.id == null ? { ok: false, error: s.error } : await ttWaitDownload(s.id);
  chrome.runtime.sendMessage({ target: "offscreen", type: "revoke", blobUrl: b.blobUrl }).catch(() => {});
  return Object.assign(d, { size: b.size });
}

async function ttDownload(text) {
  const T = self.RMTikTok;
  if (!T) return { ok: false, error: "modul tiktok.js tidak termuat" };
  const raw = T.extractUrl(text);
  let c = T.classify(raw);
  if (!c) return { ok: false, error: "Bukan link video TikTok: " + String(text || "").slice(0, 80) };
  await ttEnsureRefererRule();
  ttBadge("…", "#888");
  // 1) page (short links vm./vt. redirect to the canonical /video/ URL)
  let res;
  try { res = await fetch(c.url, { credentials: "include", redirect: "follow" }); }
  catch (e) { return { ok: false, error: "Gagal buka halaman TikTok: " + e.message }; }
  if (c.kind === "short") {
    const c2 = T.classify(res.url);
    if (!c2 || c2.kind !== "video") return { ok: false, error: "Link pendek tidak mengarah ke video: " + res.url };
    c = c2;
  }
  const parsed = T.parseItem(await res.text());
  if (parsed.error) return { ok: false, error: parsed.error };
  const cands = T.candidates(parsed.item);
  if (!cands.length) return { ok: false, error: "Tidak ada stream video (mungkin ini postingan foto/slideshow)" };
  const best = cands[0];
  const filename = T.filename(parsed.item, best);
  // 2) try every mirror of the best quality, then fall back to lower qualities.
  // v0.9.29: TikTok's CDN 403s chrome.downloads (SERVER_FORBIDDEN, verified in
  // real Chromium) but accepts fetch() from the extension -> go via blob.
  const tried = [];
  for (const cand of cands) {
    for (const url of cand.urls) {
      const done = await saveViaBlob(url, T.filename(parsed.item, cand));
      if (done.ok) return { ok: true, filename: T.filename(parsed.item, cand), width: cand.width, height: cand.height,
        codec: cand.codec, fallback: cand !== best, author: (parsed.item.author || {}).uniqueId || "", bytes: done.size };
      tried.push(done.error);
    }
  }
  return { ok: false, error: "CDN TikTok menolak semua stream (" + tried.slice(0, 3).join(", ") + ")" };
}

async function ttRun(text) {
  const r = await ttDownload(text);
  if (r.ok) {
    ttBadge("✓", "#2e7d32");
    ttNotify("TikTok terdownload", r.filename + " — " + Math.min(r.width, r.height) + "p " + r.codec + (r.fallback ? " (kualitas tertinggi gagal, pakai cadangan)" : ""));
  } else {
    ttBadge("!", "#c62828");
    ttNotify("TikTok gagal", r.error);
  }
  setTimeout(() => ttBadge(""), 8000);
  return r;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== TT_MENU) return;
  // priority: right-clicked link > selected text > the page you are on
  const text = info.linkUrl || info.selectionText || info.pageUrl || (tab && tab.url) || "";
  const T = self.RMTikTok;
  const pick = [info.linkUrl, info.selectionText, info.frameUrl, info.pageUrl, tab && tab.url]
    .find((x) => x && T && T.classify(T.extractUrl(x))) || text;
  ttRun(pick);
});

/* ---------------- Facebook Ad Library downloader (v0.9.29) ----------------
 * items: [{url, fallback, filename, fallbackFilename}] built by src/fbadlib.js.
 * HD first; if the CDN refuses, retry the same file via blob, then SD. */
async function fbSaveOne(it) {
  let r = await saveDirect(it.url, it.filename);
  if (!r.ok) r = await saveViaBlob(it.url, it.filename);
  if (r.ok) return { ok: true, filename: it.filename };
  if (it.fallback) {
    const f = await saveDirect(it.fallback, it.fallbackFilename);
    if (f.ok) return { ok: true, filename: it.fallbackFilename, fallback: true };
  }
  return { ok: false, filename: it.filename, error: r.error };
}

async function fbDownload(items) {
  const list = (items || []).filter((x) => x && x.url && /^https:\/\/[^/]*\.fbcdn\.net\//i.test(x.url));
  if (!list.length) return { ok: false, error: "Tidak ada URL video fbcdn" };
  ttBadge("…", "#888");
  const results = [];
  let i = 0;
  const worker = async () => { while (i < list.length) { const it = list[i++]; results.push(await fbSaveOne(it)); ttBadge(String(results.length), "#888"); } };
  await Promise.all([worker(), worker(), worker()]); // 3 at a time
  const saved = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const fallbacks = results.filter((r) => r.fallback).length;
  ttBadge(failed.length ? "!" : "✓", failed.length ? "#c62828" : "#2e7d32");
  setTimeout(() => ttBadge(""), 8000);
  if (list.length > 1 || failed.length) ttNotify("Ad Library: " + saved + "/" + list.length + " video tersimpan",
    failed.length ? "Gagal: " + failed.slice(0, 2).map((f) => f.error).join(", ") : "Folder Downloads/fbads/");
  return { ok: saved > 0, saved, total: list.length, fallbacks, failed,
    error: saved ? undefined : (failed[0] && failed[0].error) || "gagal" };
}

/* ---------------- Ad Library -> product analysis (v0.9.31) ----------------
 * Opens each competitor's Shopee link in a BACKGROUND tab, one at a time, waits
 * for the plugin's own product-page panel to report its verdict ("pp-verdict"),
 * then closes the tab. Same pages Fikri would open by hand, at a human pace —
 * no Shopee API calls. */
const PP_WAIT = new Map(); // tabId -> resolve
const AN_MAX = 12, AN_GAP_MS = 2500, AN_TIMEOUT_MS = 35000;

function openAndWait(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (chrome.runtime.lastError || !tab) return resolve({ ok: false, error: "tab gagal dibuka" });
      const done = (r) => { clearTimeout(to); PP_WAIT.delete(tab.id); chrome.tabs.remove(tab.id, () => void chrome.runtime.lastError); resolve(r); };
      const to = setTimeout(() => done({ ok: false, error: "timeout (halaman tidak memuat panel)" }), AN_TIMEOUT_MS);
      PP_WAIT.set(tab.id, (v) => done({ ok: true, verdict: v.verdict, finalUrl: v.url }));
    });
  });
}

async function analyzeLinks(items, progress) {
  const out = [];
  for (const it of items.slice(0, AN_MAX)) {
    const r = await openAndWait(it.link);
    out.push(Object.assign({ adId: it.adId, page: it.page, days: it.days, link: it.link }, r));
    if (progress) progress(out.length, Math.min(items.length, AN_MAX));
    await new Promise((ok) => setTimeout(ok, AN_GAP_MS));
  }
  return out;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.target === "offscreen") return false; // meant for offscreen.js
  if (msg && msg.type === "pp-verdict") {
    const w = _sender && _sender.tab && PP_WAIT.get(_sender.tab.id);
    if (w) w(msg);
    return false;
  }
  if (msg && msg.type === "fbadlib-brief") {
    (async () => {
      const o = await chrome.storage.local.get("rm_config");
      const ai = ((o.rm_config || {}).ai) || {};
      if (!ai.enabled || !ai.apiKey) return reply({ ok: false, error: "AI belum aktif / API key DeepSeek belum diisi di Admin Panel" });
      let last = "";
      for (let attempt = 1; attempt <= 3; attempt++) {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60000);
        try {
          const r = await fetch(ai.baseUrl || "https://api.deepseek.com/v1/chat/completions", {
            method: "POST", signal: ctrl.signal,
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + ai.apiKey },
            body: JSON.stringify({ model: ai.model || "deepseek-chat", temperature: 0.8,
              messages: [{ role: "user", content: msg.prompt }] }) });
          clearTimeout(t);
          if (r.status === 429 || r.status >= 500) { last = "DeepSeek " + r.status; await new Promise((ok) => setTimeout(ok, 1000 * attempt)); continue; }
          if (!r.ok) return reply({ ok: false, error: "DeepSeek error " + r.status });
          const j = await r.json();
          const text = ((j.choices || [])[0] || {}).message ? j.choices[0].message.content : "";
          if (text && text.trim()) return reply({ ok: true, text });
          last = "DeepSeek balas kosong";
        } catch (e) { clearTimeout(t); last = e.name === "AbortError" ? "DeepSeek timeout (>60s)" : e.message; }
      }
      reply({ ok: false, error: last || "DeepSeek gagal" });
    })();
    return true;
  }
  if (msg && msg.type === "fbadlib-open-tracked") {
    // v0.9.32: one click to re-check every competitor page the tracker knows
    chrome.storage.local.get("rm_fbadlib_track", (o) => {
      const all = o.rm_fbadlib_track || {};
      const ids = Object.keys(all).sort((a, b) => String(all[a].lastVisit || "").localeCompare(String(all[b].lastVisit || ""))).slice(0, 15);
      ids.forEach((pid, i) => chrome.tabs.create({ active: i === 0,
        url: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ID&is_targeted_country=false" +
             "&media_type=all&search_type=page&view_all_page_id=" + pid }));
      reply({ ok: true, opened: ids.length, total: Object.keys(all).length });
    });
    return true;
  }
  if (msg && msg.type === "fbadlib-analyze") {
    const tabId = _sender && _sender.tab && _sender.tab.id;
    analyzeLinks(msg.items || [], (i, n) => {
      if (tabId != null) chrome.tabs.sendMessage(tabId, { type: "fbadlib-analyze-progress", i, n }, () => void chrome.runtime.lastError);
    }).then((results) => reply({ ok: true, results }));
    return true;
  }
  if (msg && msg.type === "tiktok-download") { ttRun(msg.text).then(reply); return true; }
  if (msg && msg.type === "fbadlib-download") { fbDownload(msg.items).then(reply); return true; }
  if (msg && msg.type === "fbadlib-json") {
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(msg.doc, null, 1))));
    dl({ url: "data:application/json;base64," + b64, filename: msg.filename }).then(reply);
    return true;
  }
  if (!msg || msg.type !== "gahwa-pack") return false;
  (async () => {
    const results = [];
    for (const f of msg.files) results.push(Object.assign({ filename: f.filename }, await dl(f)));
    const json = JSON.stringify(msg.job, null, 1);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    results.push(Object.assign({ filename: msg.folder + "/gahwa_job.json" },
      await dl({ url: "data:application/json;base64," + b64, filename: msg.folder + "/gahwa_job.json" })));
    const failed = results.filter((r) => !r.ok);
    reply({ ok: failed.length === 0, files: results.length, failed });
  })();
  return true; // async reply
});
