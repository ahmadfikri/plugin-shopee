/* fbadlib-content.js — Ad Library UI (v0.9.29).
 * Adds "⬇ HD" to every ad card that has a video, plus a floating bar:
 * "⬇ Semua video (N)" and "⬇ Data iklan (JSON)". Ad data comes from the
 * page's inline JSON + GraphQL responses relayed by fbadlib-hook.js.
 * Downloads run in background.js (content scripts cannot call chrome.downloads). */
(function () {
  "use strict";
  const A = window.RMFbAdLib;
  if (!A || window.__rmFbUi) return;
  window.__rmFbUi = true;

  const ads = new Map(); // ad_archive_id -> ad
  const done = new Set(); // ad ids downloaded this page view

  function addAds(list) {
    let n = 0;
    for (const ad of list) {
      const old = ads.get(ad.id);
      if (!old || (!old.videos.length && ad.videos.length)) { ads.set(ad.id, ad); n++; }
    }
    if (n) schedule();
  }

  function scanInline() {
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      const t = s.textContent;
      if (t && t.indexOf("ad_archive_id") !== -1) addAds(A.extractFromText(t));
    }
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== "rm-fbadlib") return;
    try { addAds(A.extractFromText(e.data.text)); } catch (_) {}
  });

  // --- downloads ---------------------------------------------------------
  function send(msg) {
    return new Promise((resolve) => {
      try { chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : r)); }
      catch (e) { resolve({ ok: false, error: e.message }); }
    });
  }

  async function downloadAds(list, btn) {
    const items = [];
    for (const ad of list) items.push(...A.downloadsFor(ad));
    if (!items.length) return { ok: false, error: "Tidak ada video" };
    if (btn) { btn.disabled = true; btn.textContent = "⏳ " + items.length + " video…"; }
    const r = await send({ type: "fbadlib-download", items });
    if (r && r.ok) list.forEach((ad) => done.add(ad.id));
    return r || { ok: false, error: "tidak ada respon" };
  }

  // --- per-card buttons ----------------------------------------------------
  // A card = the highest ancestor of the "ID Galeri: N" text that still holds
  // only ONE ad id. Class names are obfuscated and change, so no CSS selectors.
  function findCards() {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const id = A.cardIdFromText(n.textContent);
      if (!id) continue;
      let el = n.parentElement, card = null, depth = 0;
      while (el && el !== document.body && depth < 25) {
        if (A.countCardIds(el.innerText) > 1) break;
        if (el.querySelector("video, img")) card = el;
        el = el.parentElement; depth++;
      }
      if (card) out.push({ id, card, label: n.parentElement });
    }
    return out;
  }

  function decorate() {
    for (const { id, card, label } of findCards()) {
      const ad = ads.get(id);
      if (!ad || !ad.videos.length) continue;
      if (card.querySelector(".rm-fb-dl")) continue;
      const b = document.createElement("button");
      b.className = "rm-fb-dl";
      b.type = "button";
      const reset = () => { b.disabled = false; b.textContent = done.has(id) ? "✅ Sudah didownload" : "⬇ Download video HD" + (ad.videos.length > 1 ? " (" + ad.videos.length + ")" : ""); };
      reset();
      b.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const r = await downloadAds([ad], b);
        b.disabled = false;
        b.textContent = r.ok ? "✅ " + r.saved + " file" + (r.fallbacks ? " (" + r.fallbacks + " SD)" : "") : "❌ " + r.error;
        setTimeout(reset, 6000);
      });
      label.insertAdjacentElement("afterend", b);
    }
    renderBar();
  }

  // --- floating bar --------------------------------------------------------
  let bar;
  function renderBar() {
    const withVid = [...ads.values()].filter((a) => a.videos.length);
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "rm-fb-bar";
      bar.innerHTML = '<b>🎬 syabab</b> <span class="rm-fb-count"></span>' +
        '<button type="button" class="rm-fb-all"></button>' +
        '<button type="button" class="rm-fb-json">⬇ Data iklan (JSON)</button>';
      document.body.appendChild(bar);
      bar.querySelector(".rm-fb-all").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const list = [...ads.values()].filter((a) => a.videos.length && !done.has(a.id));
        if (!list.length) { btn.textContent = "Semua sudah didownload"; setTimeout(renderBar, 3000); return; }
        const r = await downloadAds(list, btn);
        btn.disabled = false;
        btn.textContent = r.ok ? "✅ " + r.saved + " file tersimpan" : "❌ " + (r.error || "gagal");
        setTimeout(renderBar, 6000);
      });
      bar.querySelector(".rm-fb-json").addEventListener("click", () => {
        const list = [...ads.values()];
        const page = list[0] ? A.slug(list[0].pageName || list[0].pageId) : "fbads";
        send({ type: "fbadlib-json", filename: "fbads/" + page + "/ads_" + page + "_" + new Date().toISOString().slice(0, 10) + ".json",
          doc: { source: location.href, exportedAt: new Date().toISOString(), count: list.length, ads: list } });
      });
    }
    bar.querySelector(".rm-fb-count").textContent = ads.size + " iklan · " + withVid.length + " video";
    const all = bar.querySelector(".rm-fb-all");
    if (!all.disabled) {
      const left = withVid.filter((a) => !done.has(a.id)).length;
      all.textContent = "⬇ Semua video HD (" + left + ")";
    }
  }

  let timer = 0;
  function schedule() { clearTimeout(timer); timer = setTimeout(decorate, 400); }

  scanInline();
  // ignore mutations caused by our own bar/buttons, otherwise decorate() re-triggers itself
  const ours = (n) => n && n.nodeType === 1 && (n.classList.contains("rm-fb-dl") || n.classList.contains("rm-fb-bar") || n.closest(".rm-fb-bar, .rm-fb-dl"));
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (ours(m.target)) continue;
      if ([...m.addedNodes].every(ours) && m.addedNodes.length) continue;
      schedule(); return;
    }
  }).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
