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
      if (!ad) continue;
      if (!card.querySelector(".rm-fb-sig")) {
        const sg = A.signal(ad);
        const t = document.createElement("div");
        t.className = "rm-fb-sig rm-fb-" + sg.tier.toLowerCase();
        t.textContent = sg.label;
        t.title = "Lama tayang = sinyal untung (orang gak bayar iklan rugi berminggu-minggu). Variasi banyak = lagi di-scale.";
        label.insertAdjacentElement("afterend", t);
      }
      if (!ad.videos.length) continue;
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
      (card.querySelector(".rm-fb-sig") || label).insertAdjacentElement("afterend", b);
    }
    updateTrack();
    renderBar();
    if (top && top.style.display !== "none") renderTop();
  }

  // --- "🏆 Top iklan" list: every captured ad, best signal first ----------
  let top;
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const shopeeOf = (ad) => {
    const m = (ad.linkUrl + " " + ad.body).match(/https?:\/\/(?:s\.shopee\.co\.id|shopee\.co\.id)\/[^\s"'<>]+/i);
    return m ? m[0].replace(/[),.]+$/, "") : "";
  };
  // v0.9.31 state that must survive re-renders of the Top panel
  const verdicts = new Map();  // ad id -> {action, roas, maxCpc, name, error}
  let analyzing = false, anProgress = "";
  const VERDICT_CLS = { "IKLANKAN": "ok", "LAYAK COBA": "ok", "UJI KECIL": "mid", "HATI-HATI": "mid", "LEWATI": "bad" };

  async function analyzeTerbukti(btn) {
    if (analyzing) return;
    const seen = new Set();
    const items = A.rank([...ads.values()])
      .filter((a) => A.signal(a).tier === "TERBUKTI" && shopeeOf(a) && !verdicts.has(a.id))
      .filter((a) => { const l = shopeeOf(a); if (seen.has(l)) return false; seen.add(l); return true; })
      .map((a) => ({ adId: a.id, page: a.pageName, days: a.days, link: shopeeOf(a) }));
    if (!items.length) { btn.textContent = "Tidak ada link TERBUKTI baru"; return; }
    analyzing = true; anProgress = "0/" + Math.min(items.length, 12); renderTop();
    const r = await send({ type: "fbadlib-analyze", items });
    analyzing = false; anProgress = "";
    for (const x of (r && r.results) || []) {
      verdicts.set(x.adId, x.ok ? Object.assign({}, x.verdict) : { error: x.error });
    }
    renderTop();
  }
  chrome.runtime.onMessage.addListener((m) => {
    if (m && m.type === "fbadlib-analyze-progress") { anProgress = m.i + "/" + m.n; if (top) renderTop(); }
  });

  // creative brief box (separate element so table re-renders never wipe it)
  let briefBox;
  async function makeBrief(ad, btn) {
    btn.disabled = true; btn.textContent = "⏳";
    if (!briefBox) {
      briefBox = document.createElement("div");
      briefBox.className = "rm-fb-brief";
      document.body.appendChild(briefBox);
      briefBox.addEventListener("click", (e) => {
        if (e.target.classList.contains("rm-fb-x")) briefBox.style.display = "none";
        if (e.target.classList.contains("rm-fb-copy")) {
          const ta = briefBox.querySelector("textarea");
          navigator.clipboard.writeText(ta.value).then(() => { e.target.textContent = "✓ Tersalin"; }, () => { ta.select(); });
        }
      });
    }
    briefBox.style.display = "block";
    briefBox.innerHTML = "<div class='rm-fb-top-h'><b>✍️ Brief kreatif</b> " + esc(ad.pageName) + " · " + ad.days +
      " hari <button type='button' class='rm-fb-x'>✕</button></div><div>⏳ DeepSeek menyusun brief…</div>";
    const r = await send({ type: "fbadlib-brief", prompt: A.briefPrompt(ad) });
    btn.disabled = false; btn.textContent = "✍️";
    const body = r && r.ok ? A.cleanBrief(r.text) : "❌ " + ((r && r.error) || "gagal") + "\n\nKlik ✍️ lagi untuk coba ulang.";
    briefBox.innerHTML = "<div class='rm-fb-top-h'><b>✍️ Brief kreatif</b> " + esc(ad.pageName) + " · " + ad.days +
      " hari <button type='button' class='rm-fb-copy'>Copy</button><button type='button' class='rm-fb-x'>✕</button></div>" +
      "<div class='rm-fb-note'>Brief original dari ANGLE iklan ini. Jangan pakai ulang video/kalimat kompetitor. Tanpa harga.</div>" +
      "<textarea rows='18'></textarea>";
    briefBox.querySelector("textarea").value = body;
  }

  function renderTop() {
    if (!top) {
      top = document.createElement("div");
      top.className = "rm-fb-top";
      document.body.appendChild(top);
      top.addEventListener("click", (e) => {
        const t = e.target;
        if (t.classList.contains("rm-fb-x")) top.style.display = "none";
        if (t.classList.contains("rm-fb-analyze")) analyzeTerbukti(t);
        const go = t.getAttribute("data-dl");
        if (go) { const ad = ads.get(go); if (ad) downloadAds([ad], t).then((r) => { t.disabled = false; t.textContent = r.ok ? "✅" : "❌"; }); }
        const br = t.getAttribute("data-brief");
        if (br) { const ad = ads.get(br); if (ad) makeBrief(ad, t); }
      });
    }
    const cell = (ad) => {
      const v = verdicts.get(ad.id);
      if (!v) return "–";
      if (v.error) return "<span class='rm-fb-v bad' title='" + esc(v.error) + "'>gagal</span>";
      return "<span class='rm-fb-v " + (VERDICT_CLS[v.action] || "mid") + "' title='" + esc((v.reasons || []).join(" ")) + "'>" +
        esc(v.action) + (v.roas != null ? " · " + v.roas.toFixed(2) + "x" : "") +
        (v.maxCpc != null ? " · maks Rp" + v.maxCpc : "") + "</span>";
    };
    const rows = A.rank([...ads.values()]).slice(0, 60).map((ad, i) => {
      const sg = A.signal(ad), link = shopeeOf(ad);
      const isNew = track && track.baru.includes(ad.id) && !track.firstVisit;
      return "<tr class='rm-fb-" + sg.tier.toLowerCase() + "'><td>" + (i + 1) + "</td><td>" + esc(sg.label) +
        (isNew ? " <span class='rm-fb-new'>BARU</span>" : "") + "</td>" +
        "<td>" + esc(ad.pageName) + "</td><td>" + esc(ad.body.replace(/\s+/g, " ").slice(0, 70)) + "</td>" +
        "<td>" + (link ? "<a href='" + esc(link) + "' target='_blank' rel='noopener'>Shopee ↗</a>" : "–") + "</td>" +
        "<td>" + cell(ad) + "</td>" +
        "<td>" + (ad.videos.length ? "<button type='button' data-dl='" + esc(ad.id) + "' title='Download video HD'>⬇</button> " : "") +
        "<button type='button' data-brief='" + esc(ad.id) + "' title='Brief kreatif original dari angle iklan ini'>✍️</button></td></tr>";
    }).join("");
    const all = [...ads.values()];
    const nWin = all.filter((a) => A.signal(a).tier === "TERBUKTI").length;
    const nLink = new Set(all.filter((a) => A.signal(a).tier === "TERBUKTI").map(shopeeOf).filter(Boolean)).size;
    const anBtn = analyzing
      ? "<button type='button' disabled>⏳ Menganalisa " + esc(anProgress) + "…</button>"
      : "<button type='button' class='rm-fb-analyze' title='Buka tiap link Shopee di tab latar (satu per satu, maks 12) dan ambil vonis panel produk'>🔍 Analisa produk TERBUKTI (" + nLink + ")</button>";
    top.innerHTML = "<div class='rm-fb-top-h'><b>🏆 Top iklan</b> " + nWin + " terbukti (≥14 hari) dari " + ads.size +
      ". " + anBtn + " <button type='button' class='rm-fb-x'>✕</button></div>" +
      trackHtml() +
      "<table><tr><th>#</th><th>Sinyal</th><th>Page</th><th>Teks iklan</th><th>Produk</th><th>Vonis kita</th><th></th></tr>" + rows + "</table>";
    top.style.display = "block";
  }

  // --- competitor tracker (per advertiser page, v0.9.31) -------------------
  const TRACK_KEY = "rm_fbadlib_track";
  const pageIdOfUrl = () => { const m = /[?&]view_all_page_id=(\d+)/.exec(location.search); return m ? m[1] : null; };
  let trackPrev = null, track = null, trackSaveT = 0;
  const today = () => new Date().toISOString().slice(0, 10);
  if (pageIdOfUrl()) {
    chrome.storage.local.get(TRACK_KEY, (o) => {
      const all = o[TRACK_KEY] || {};
      trackPrev = (all[pageIdOfUrl()] || {}).ads || {};
      trackPrev.__lastVisit = (all[pageIdOfUrl()] || {}).lastVisit || null;
      updateTrack();
    });
  }
  function updateTrack() {
    const pid = pageIdOfUrl();
    if (!pid || !trackPrev) return;
    const prevAds = Object.assign({}, trackPrev); const lastVisit = prevAds.__lastVisit; delete prevAds.__lastVisit;
    const cur = [...ads.values()].filter((a) => a.pageId === pid);
    track = A.trackDiff(prevAds, cur, today());
    track.lastVisit = lastVisit;
    clearTimeout(trackSaveT);
    trackSaveT = setTimeout(() => chrome.storage.local.get(TRACK_KEY, (o) => {
      const all = o[TRACK_KEY] || {};
      all[pid] = { lastVisit: today(), page: (cur[0] || {}).pageName || "", ads: track.store };
      chrome.storage.local.set({ [TRACK_KEY]: all });
    }), 1500);
  }
  function trackHtml() {
    if (!track) return "";
    if (track.firstVisit) return "<div class='rm-fb-track'>📒 Pelacak: kunjungan pertama ke page ini, " +
      Object.keys(track.store).length + " iklan dicatat. Buka lagi besok untuk lihat iklan yang baru muncul / berhenti.</div>";
    const gone = track.hilang.map((id) => track.store[id]).filter(Boolean);
    const list = gone.slice(0, 8).map((g) => "<li>" + esc(g.body.slice(0, 70)) + " · tayang " + (g.days || "?") + " hari" +
      (g.link ? " · <a href='" + esc(g.link) + "' target='_blank' rel='noopener'>Shopee ↗</a>" : "") + "</li>").join("");
    return "<div class='rm-fb-track'>📒 Sejak kunjungan " + esc(track.lastVisit || "terakhir") + ": <b>" + track.baru.length +
      " iklan baru</b> (sedang dites kompetitor), <b>" + gone.length + " tidak terlihat lagi</b>" +
      (gone.length ? " — kemungkinan dimatikan (rugi). Scroll sampai bawah dulu untuk memastikan." : ".") +
      (list ? "<ul>" + list + "</ul>" : "") + "</div>";
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
        '<button type="button" class="rm-fb-topbtn">🏆 Top iklan</button>' +
        '<button type="button" class="rm-fb-json">⬇ Data iklan (JSON)</button>';
      document.body.appendChild(bar);
      bar.querySelector(".rm-fb-topbtn").addEventListener("click", () => {
        if (top && top.style.display !== "none") top.style.display = "none"; else renderTop();
      });
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
          doc: { source: location.href, exportedAt: new Date().toISOString(), count: list.length,
            ads: A.rank(list).map((a) => Object.assign({ signal: A.signal(a), shopeeLink: shopeeOf(a) }, a)) } });
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
  const OURS = ".rm-fb-bar, .rm-fb-dl, .rm-fb-sig, .rm-fb-top, .rm-fb-brief";
  const ours = (n) => n && n.nodeType === 1 && !!n.closest(OURS);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (ours(m.target)) continue;
      if ([...m.addedNodes].every(ours) && m.addedNodes.length) continue;
      schedule(); return;
    }
  }).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
