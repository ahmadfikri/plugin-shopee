/* content.js — orchestrator. Runs on Shopee search pages: scrape -> analyze ->
 * inject panel -> wire actions. Everything stays inside the plugin. */
(function () {
  "use strict";
  const { RMStore, RMScraper, RMAnalytics, RMPanel, RMAi } = window;
  let lastAnalysis = null;

  function isSearchPage() {
    // Marketplace search OR any affiliate.shopee page (product/search surfaces there).
    if (location.hostname.startsWith("affiliate.")) return true;
    return /\/search/.test(location.pathname) && /keyword=/.test(location.search);
  }

  function csvEscape(s) { return '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"'; }

  async function exportWatchlist() {
    const list = await RMStore.getWatchlist();
    if (!list.length) { alert("Watchlist masih kosong."); return; }
    const head = ["id", "name", "price", "unitsPerMonth", "revenuePerMonth",
                  "layak", "suggestedTag", "href"];
    const rows = list.map((x) => head.map((k) => csvEscape(x[k])).join(","));
    const blob = new Blob([head.join(",") + "\n" + rows.join("\n")],
                          { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "riset-watchlist-" + Date.now() + ".csv"; // NEW file, plugin-owned
    a.click();
    URL.revokeObjectURL(url);
  }

  // Draw the cumulative shortlist into the panel host and wire its controls.
  // `expanded` false = top 20 only; true = every scanned product.
  function renderShortlist(panel, expanded) {
    if (!window.RMShortlist || !panel) return;
    const host = panel.querySelector(".rm-sl-host");
    if (!host) return;
    if (typeof expanded === "boolean") shortlistExpanded = expanded;
    const isOpen = shortlistExpanded;
    RMShortlist.getMeta().then((meta) => {
      host.innerHTML = RMPanel.shortlistSection(meta, isOpen);
      const t = host.querySelector(".rm-sl-toggle");
      if (t) t.addEventListener("click", () => renderShortlist(panel, !isOpen));
      const ex = host.querySelector(".rm-sl-export");
      if (ex) ex.addEventListener("click", () => {
        const csv = RMShortlist.toCsv(meta.items || []);
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a2 = document.createElement("a");
        a2.href = url;
        a2.download = "riset-shortlist-" + Date.now() + ".csv";
        a2.click();
        URL.revokeObjectURL(url);
      });
      const cl = host.querySelector(".rm-sl-clear");
      if (cl) cl.addEventListener("click", () => {
        if (!confirm("Kosongkan seluruh shortlist kumulatif?")) return;
        RMShortlist.clear().then(() => renderShortlist(panel, false));
      });

      // ---- AUTOMATIC bulk scan across category tabs ----
      const bulk = host.querySelector(".rm-sl-bulk");
      const stopBtn = host.querySelector(".rm-sl-stop");
      const prog = host.querySelector(".rm-sl-progress");
      const pagesCb = host.querySelector(".rm-sl-pages");
      if (bulk && window.RMBulk) bulk.addEventListener("click", async () => {
        const cfg = await loadCfg();
        const tabs = RMBulk.findCategoryTabs();
        if (!tabs.length && !confirm(
            "Tidak menemukan tab kategori di halaman ini. Pindai halaman ini saja?")) return;
        bulk.disabled = true; bulk.textContent = "⏳ Memindai…";
        if (stopBtn) stopBtn.style.display = "";
        if (prog) prog.style.display = "block";
        // CRITICAL: stop the DOM observer from rebuilding the panel while the
        // crawl clicks tabs — that was destroying the progress line mid-scan.
        suspend();
        await waitIdle();   // let any in-flight render finish before we take over
        try {
          const r = await RMBulk.run({
            cfg,
            includePages: !!(pagesCb && pagesCb.checked),
            onProgress: (s) => {
              if (!prog) return;
              if (s.phase === "scan") {
                prog.textContent = `Memindai ${s.index}/${s.of}: ${s.label} — ` +
                  `terkumpul ${s.total} produk`;
              } else if (s.phase === "skip") {
                prog.textContent = `Lewati ${s.label} (${s.note}) — ${s.total} produk`;
              } else {
                prog.textContent = (s.note || s.phase) +
                  (s.total != null ? ` — total ${s.total} produk` : "");
              }
            }
          });
          if (r && r.error && prog) prog.textContent = r.error;
        } catch (err) {
          if (prog) prog.textContent = "Gagal: " + (err && err.message || err);
        } finally {
          resume();
          lastSig = "";   // page moved while suspended; allow a fresh scan
          bulk.disabled = false; bulk.textContent = "▶ Bulk Scan Semua Kategori";
          if (stopBtn) { stopBtn.style.display = "none"; stopBtn.textContent = "■ Stop"; }
          renderShortlist(panel, shortlistExpanded);
        }
      });
      if (stopBtn && window.RMBulk) stopBtn.addEventListener("click", () => {
        RMBulk.stop();
        stopBtn.textContent = "menghentikan…";
      });

      // ---- bulk scan by SEARCH KEYWORD ----
      const kwScan = host.querySelector(".rm-sl-kwscan");
      const kwInput = host.querySelector(".rm-sl-kwinput");
      if (kwScan && window.RMBulk) kwScan.addEventListener("click", async () => {
        const raw = (kwInput && kwInput.value) || "";
        const keywords = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
        if (!keywords.length) {
          alert("Isi dulu kata kuncinya, pisahkan dengan koma.\nContoh: tumbler, casing iphone, tas anak");
          return;
        }
        if (!RMBulk.findSearchInput()) {
          alert("Kotak pencarian produk tidak ditemukan di halaman ini. " +
                "Buka halaman Product Offer yang punya kolom search.");
          return;
        }
        kwScan.disabled = true; kwScan.textContent = "⏳ Memindai…";
        if (stopBtn) stopBtn.style.display = "";
        if (prog) prog.style.display = "block";
        suspend();
        await waitIdle();   // let any in-flight render finish before we take over
        try {
          const r = await RMBulk.runKeywords({
            cfg: await loadCfg(),
            keywords,
            onProgress: (s) => {
              if (!prog) return;
              if (s.phase === "search") {
                prog.textContent = `(${s.index}/${s.of}) mencari "${s.label}"…`;
              } else if (s.phase === "scan") {
                prog.textContent = `(${s.index}/${s.of}) "${s.label}" — ${s.note}, ` +
                  `terkumpul ${s.total} produk`;
              } else if (s.phase === "skip") {
                prog.textContent = `(${s.index}/${s.of}) "${s.label}" dilewati: ${s.note}`;
              } else {
                prog.textContent = (s.note || s.phase) +
                  (s.total != null ? ` — total ${s.total} produk` : "");
              }
            }
          });
          if (r && r.error && prog) prog.textContent = r.error;
        } catch (err) {
          if (prog) prog.textContent = "Gagal: " + (err && err.message || err);
        } finally {
          resume();
          lastSig = "";
          kwScan.disabled = false; kwScan.textContent = "🔎 Bulk Scan Keyword";
          if (stopBtn) { stopBtn.style.display = "none"; stopBtn.textContent = "■ Stop"; }
          renderShortlist(panel, shortlistExpanded);
        }
      });
    });
  }

  function wire(panel, cfg) {
    panel.querySelector(".rm-toggle").addEventListener("click", async () => {
      const body = panel.querySelector(".rm-body");
      const hidden = body.style.display === "none";
      body.style.display = hidden ? "" : "none";
      panel.querySelector(".rm-toggle").textContent = hidden ? "Sembunyikan" : "Tampilkan";
      cfg.panelCollapsed = !hidden; RMStore.setConfig(cfg);
    });
    panel.querySelector(".rm-export").addEventListener("click", exportWatchlist);

    panel.addEventListener("click", async (e) => {
      // ---- drill-down: click a product name -> deep-analysis modal ----
      const drill = e.target.closest && e.target.closest(".rm-drill");
      if (drill) {
        const id = drill.getAttribute("data-id");
        const p = lastAnalysis && lastAnalysis.products.find((x) => x.id === id);
        if (!p) return;
        // open modal immediately with a loading state, then fill with detail
        document.querySelectorAll(".rm-modal-bg").forEach((n) => n.remove());
        let modal = RMPanel.buildDetailModal(p, { error: null }, p.pro, p.epcPred);
        document.body.appendChild(modal);
        wireModal(modal, p);
        let detail = {};
        try { if (window.RMEnrich) detail = await RMEnrich.fetchDetail(p); } catch (err) { detail = { error: String(err) }; }
        const fresh = RMPanel.buildDetailModal(p, detail, p.pro, p.epcPred);
        modal.replaceWith(fresh);
        wireModal(fresh, p);
        return;
      }

      const id = e.target.getAttribute && e.target.getAttribute("data-id");
      if (!id || !lastAnalysis) return;
      const p = lastAnalysis.products.find((x) => x.id === id);
      if (!p) return;

      if (e.target.classList.contains("rm-star")) {
        let tag = "";
        try { if (cfg.ai.enabled) tag = await RMAi.generateTag(cfg, p); } catch (_) {}
        await RMStore.addToWatchlist({
          id: p.id, name: p.name, price: p.price,
          unitsPerMonth: p.unitsPerMonth, revenuePerMonth: p.revenuePerMonth,
          layak: (p.pro && p.pro.action) || "", suggestedTag: tag, href: p.href
        });
        e.target.textContent = "★";
      }

      if (e.target.classList.contains("rm-ai")) {
        e.target.textContent = "…";
        try {
          const cap = await RMAi.generateCaption(cfg, p);
          alert("Caption untuk " + p.name + ":\n\n" + cap);
        } catch (err) {
          alert("AI: " + err.message);
        }
        e.target.textContent = "✨";
      }
    });
  }

  // Render generated text into the modal's shared output area, copy-ready.
  // Used by BOTH Caption and Prompt Video — no popups, always paste-able.
  async function showOutput(modal, title, text, hint) {
    const out = modal.querySelector(".rm-out");
    if (!out) { alert(text); return; }
    try { await navigator.clipboard.writeText(text); } catch (_) {}
    out.style.display = "block";
    out.innerHTML =
      `<div class="rm-section-t">${title} — sudah disalin ke clipboard</div>` +
      `<textarea class="rm-out-ta" rows="10"></textarea>` +
      (hint ? `<div class="rm-sub">${hint}</div>` : "");
    out.querySelector(".rm-out-ta").value = text;
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // wire modal-internal buttons (close, save, caption, video, video prompt)
  // NOTE (2026-09-21, Fikri): the mandatory campaign-tag + reasoning form was
  // REMOVED — having to type a tag and a reason before every generate was pure
  // friction. Generation now runs immediately. The Learning Ledger still gets
  // fed, silently: we record the experiment with the tag we already know
  // (suggestedTag) and the rotated concept. Reasoning is no longer collected.
  // Never blocks, never alerts — a failure here must not stop generation.
  async function autoLog(p) {
    try {
      if (!window.RMLedger) return;
      const tag = (p.suggestedTag || "").trim();
      if (!tag) return; // no tag known — nothing useful to key the entry on
      const detail = (window.RMDetailScrape && RMDetailScrape.isProductPage())
        ? RMDetailScrape.scrapeDetail() : {};
      await RMLedger.add({
        tag, source: "plugin",
        concept: p.__concept || null,
        product: {
          category: (detail && (detail.categoryL1 || detail.category)) || null,
          price: p.price, rating: p.rating != null ? p.rating : (detail && detail.rating)
        }
      });
    } catch (_) {}
  }

  function wireModal(modal, p) {
    const cfgP = RMStore.getConfig();
    modal.querySelector(".rm-modal-x") && modal.querySelector(".rm-modal-x").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    const star = modal.querySelector(".rm-star2");
    if (star) star.addEventListener("click", async () => {
      const cfg = await cfgP; let tag = "";
      try { if (cfg.ai.enabled) tag = await RMAi.generateTag(cfg, p); } catch (_) {}
      await RMStore.addToWatchlist({ id: p.id, name: p.name, price: p.price,
        unitsPerMonth: p.unitsPerMonth, revenuePerMonth: p.revenuePerMonth,
        layak: (p.pro && p.pro.action) || "", suggestedTag: tag, href: p.href });
      star.textContent = "★ Tersimpan";
    });
    const ai = modal.querySelector(".rm-ai2");
    if (ai) ai.addEventListener("click", async () => {
      const cfg = await cfgP; ai.textContent = "membuat…";
      autoLog(p);
      try {
        const cap = await RMAi.generateCaption(cfg, p);
        await showOutput(modal, "Caption Iklan", cap,
          "Tempel ke caption Facebook/Instagram. Ingat: untuk Facebook, taruh link affiliate di BARIS PERTAMA (di atas fold 'See more').");
      } catch (err) { alert("AI: " + err.message); }
      ai.textContent = "✨ Caption";
    });
    const vid = modal.querySelector(".rm-video");
    if (vid) vid.addEventListener("click", async () => {
      vid.textContent = "…";
      try {
        const r = await window.RMVideo.grab();
        if (r.type === "m3u8") {
          await showOutput(modal, "Perintah ffmpeg (video HLS)", r.cmd,
            "Tempel di Terminal untuk jadikan mp4.");
        } else {
          alert(r.msg);
        }
      } catch (err) { alert("Video: " + err.message); }
      vid.textContent = "⬇ Video";
    });
    const vp = modal.querySelector(".rm-vprompt");
    if (vp) vp.addEventListener("click", async () => {
      const cfg = await cfgP;
      vp.textContent = "membuat…";
      autoLog(p);
      try {
        const prompt = await RMAi.generateVideoPrompt(cfg, p);
        const mode = RMAi.videoMode ? RMAi.videoMode(cfg, p) : "";
        await showOutput(modal,
          "Prompt Video (Veo/Gemini)" + (mode ? " — " + mode : ""), prompt,
          "Buka Google Flow/Veo atau Gemini → tempel prompt (sudah berupa perintah 'Buatkan video…') → drag gambar produk sebagai referensi (Ingredients to Video) → generate.");
      } catch (err) { alert("Prompt video: " + err.message); }
      vp.textContent = "🎬 Prompt Video";
    });
    // ---- (removed 2026-09-21) the "+ Catat campaign eksternal" button lived
    // here. It existed only to collect a tag + reason by hand for content
    // downloaded from TikTok. Fikri dropped the manual-entry feature, so the
    // button and its handler are gone.

    // ---- capture training data (one click) ----
    const cap = modal.querySelector(".rm-capture");
    if (cap && window.RMDataset) cap.addEventListener("click", async () => {
      cap.textContent = "menyimpan…"; cap.disabled = true;
      try {
        const cfg = await cfgP;
        // re-scrape the currently-open detail page for the freshest features
        const detail = (window.RMDetailScrape && RMDetailScrape.isProductPage())
          ? RMDetailScrape.scrapeDetail() : {};
        const res = await RMDataset.capture(detail || {}, p, cfg,
                                           { source: "detail", auto: false });
        cap.textContent = res.updated
          ? `✓ Diperbarui (total ${res.total})`
          : `✓ Tersimpan (total ${res.total})`;
      } catch (err) {
        cap.textContent = "gagal: " + (err && err.message || err);
      }
      cap.disabled = false;
      setTimeout(() => { cap.textContent = "💾 Refresh Data Training"; }, 3000);
    });
  }

  // Load config plus the imported performance snapshot (feedback loop). The
  // snapshot rides on cfg.__perf so analytics/proscore can calibrate Max CPC.
  async function loadCfg() {
    const cfg = await RMStore.getConfig();
    try {
      if (window.RMPerf) cfg.__perf = await RMPerf.load();
    } catch (_) { cfg.__perf = null; }
    return cfg;
  }

  async function run() {
    // ---- MODE A: product detail page — read rendered DOM (no API, no fetch) ----
    if (window.RMDetailScrape && RMDetailScrape.isProductPage()) {
      const cfg = await loadCfg();
      const d = RMDetailScrape.scrapeDetail();
      if (!d) return;
      // build a product object + pro score from the rendered detail data
      // price: read from an ELEMENT whose text is exactly a rupiah price, not
      // from body.textContent (which flattens stray "Rp70rb"-type fragments and
      // matched too early). Pick the most common price value on the page.
      let price = null;
      const priceCounts = {};
      document.querySelectorAll("div,span").forEach((el) => {
        const t = (el.textContent || "").trim();
        if (/^Rp\s?\d{1,3}(?:\.\d{3})+$/.test(t)) {
          const n = parseInt(t.replace(/[^\d]/g, ""), 10);
          if (n) priceCounts[n] = (priceCounts[n] || 0) + 1;
        }
      });
      // the displayed selling price is the most frequently repeated Rp element
      const ranked = Object.entries(priceCounts).sort((a, b) => b[1] - a[1]);
      if (ranked.length) price = parseInt(ranked[0][0], 10);
      const product = {
        id: (d.shopid && d.itemid) ? d.shopid + "." + d.itemid : location.href,
        name: d.name, price, href: location.href,
        soldTotal: d.historicalSold, rating: d.rating, reviewCount: d.totalReviews,
        starBreakdown: d.starBreakdown, likedCount: d.likedCount,
        hasVideo: !!(window.RMVideo && RMVideo.hasVideo()),
        ageMonths: null, unitsPerMonth: null, revenuePerMonth: null
      };
      if (window.RMProScore) {
        const calib = (cfg.__perf && window.RMPerf)
          ? RMPerf.calibrate(product, cfg, cfg.__perf) : null;
        product.calib = calib;
        product.pro = RMProScore.scoreProduct(product, cfg, { marketSize: 0 }, calib);
      }
      // EPC prediction (Empirical Bayes) — the scientific score beside PRO.
      let epcPred = null;
      if (window.RMEpc && cfg.__perf) {
        const model = RMEpc.build(cfg.__perf);
        if (model) {
          const m = (window.RMPerf && RMPerf.matchTag)
            ? RMPerf.matchTag(product.name, cfg.__perf) : null;
          epcPred = RMEpc.predict(model, {
            tag: (m && m.tag) ? m.tag : null,        // .tag — matchTag returns an object
            breakEvenCpc: (cfg && cfg.breakEvenCPC) || 0
          });
          epcPred.scored = RMEpc.score(epcPred);
          // flatten score/action onto the prediction for the panel
          epcPred.score = epcPred.scored.score;
          epcPred.action = epcPred.scored.action;
        }
      }
      product.epcPred = epcPred;
      document.querySelectorAll(".rm-panel, .rm-diag, .rm-modal-bg").forEach((n) => n.remove());
      const modal = RMPanel.buildDetailModal(product, {
        error: null, name: d.name, price, rating: d.rating,
        totalReviews: d.totalReviews, starBreakdown: d.starBreakdown,
        historicalSold: d.historicalSold, likedCount: d.likedCount,
        stock: d.inStock ? "IN STOCK" : null, isOfficial: false
      }, product.pro, epcPred);
      // detail-page: render inline (not as overlay) so it sits with the page
      modal.classList.add("rm-inline");
      (document.querySelector("main") || document.body).prepend(modal);
      wireModal(modal, product);
      lastAnalysis = { products: [product] };
      // AUTO-CAPTURE (Fikri: "biarkan data collector jalan tanpa pencet save").
      // Detail pages yield the RICHEST rows — rating, reviews, stars, sold, video.
      // Fire-and-forget: never let a storage hiccup break the panel.
      if (window.RMDataset && cfg.autoCapture !== false) {
        RMDataset.capture({
          name: d.name, price, rating: d.rating, totalReviews: d.totalReviews,
          starBreakdown: d.starBreakdown, historicalSold: d.historicalSold,
          likedCount: d.likedCount, inStock: d.inStock,
          shopid: d.shopid, itemid: d.itemid
        }, product, cfg, { source: "detail", auto: true })
          .then((r) => console.log("RM: dataset auto-capture (detail) — total", r.total))
          .catch((e) => console.log("RM: auto-capture gagal:", e && e.message));
      }
      return;
    }

    // ---- MODE B: offer/search listing page ----
    if (!isSearchPage()) return;
    const cfg = await loadCfg();
    // A bulk scan may have taken ownership of the page during the await above.
    // If so, ABORT this late render — otherwise it rebuilds the panel underneath
    // the running crawl and blanks the shortlist ("second scan shows nothing").
    if (suspended) return;
    const snap = RMScraper.scrapePage();

    document.querySelectorAll(".rm-panel, .rm-diag").forEach((n) => n.remove());

    if (!snap.products.length) {
      // Plugin is alive but parsed nothing — show a visible diagnostic instead of
      // failing silently, so we know the content script ran and can calibrate.
      const diag = document.createElement("div");
      diag.className = "rm-panel rm-diag";
      diag.innerHTML =
        `<div class="rm-head"><span class="rm-logo">📊 syabab-affiliathor</span>` +
        `<span class="rm-kw">aktif di ${location.hostname}</span></div>` +
        `<div class="rm-body"><b>0 produk ke-parse.</b> Content script jalan, tapi ` +
        `selector belum cocok dengan struktur halaman ini. ` +
        `Buka DevTools Console → cari log "RM:". Kirim potongan HTML satu kartu produk ke Kiro untuk kalibrasi.</div>`;
      (document.querySelector("main") || document.body).prepend(diag);
      console.log("RM: 0 produk. host=", location.hostname, "path=", location.pathname);
      console.log("RM: cards ditemukan oleh findCards() =", RMScraper.findCards().length);
      return;
    }

    const a = RMAnalytics.analyze(snap, cfg);
    lastAnalysis = a;
    RMStore.saveSnapshot({
      keyword: a.keyword, at: a.scrapedAt, marketSize: a.marketSize,
      productCount: a.productCount, saturation: a.saturation
    });

    const panel = RMPanel.build(a, cfg);
    (document.querySelector("main") || document.body).prepend(panel);
    wire(panel, cfg);

    // ---- BULK SCAN: accumulate this page into the cumulative shortlist ----
    // NOTE: there used to be a second "enrich then rebuild panel" pass here. It
    // is gone: enrichment is disabled (Shopee anti-bot), so it added nothing and
    // it REPLACED the panel — which blanked the shortlist rendered into the first
    // one. One panel, one render.
    if (window.RMShortlist) {
      RMShortlist.add(a.products, a.keyword || location.pathname)
        .then(() => renderShortlist(panel))
        .catch(() => renderShortlist(panel));
    } else {
      renderShortlist(panel);
    }

    // AUTO-CAPTURE the listing rows too. These are THIN (no rating/reviews —
    // those live on the detail page) but they arrive in bulk: one bulk scan can
    // add hundreds of rows of price/commission/category, which is exactly what a
    // future feature model needs. mergeRow() guarantees a thin listing row can
    // never overwrite rich detail data already captured for the same product.
    if (window.RMDataset && cfg.autoCapture !== false) {
      RMDataset.captureMany(a.products, cfg)
        .then((r) => console.log(`RM: dataset auto-capture (listing) — +${r.added} baru, ` +
                                 `${r.updated} diperbarui, total ${r.total}`))
        .catch((e) => console.log("RM: auto-capture listing gagal:", e && e.message));
    }
  }

  // Re-run when the product list changes. Shopee affiliate swaps products via
  // AJAX WITHOUT changing the URL (category tabs, search, pagination, filters),
  // so watching the URL alone misses it — we watch the DOM and debounce.
  //
  // FOUR bugs made this flaky before ("kadang berhasil kadang tidak"):
  //  1. clearTimeout on EVERY mutation. Shopee is a React SPA that mutates
  //     constantly (lazy images, carousels), so the debounce was reset forever
  //     and run() often never fired. Fixed with a MAX-WAIT: however busy the
  //     page is, we run at most MAX_WAIT_MS after the first pending change.
  //  2. No re-entrancy guard. run() awaits, so two overlapping runs could each
  //     remove the other's panel. Fixed with runInFlight + a pending re-run.
  //  3. The observer fought the bulk scan: clicking a tab mutated the DOM, which
  //     rebuilt the panel mid-scan and destroyed the progress line. Fixed with
  //     suspend()/resume() around the crawl.
  //  4. The panel was torn down every render, losing the "show all" state.
  //     Fixed by remembering shortlistExpanded across renders.
  const DEBOUNCE_MS = 600;
  const MAX_WAIT_MS = 2500;

  let lastSig = "";
  let debounceTimer = null;
  let firstPendingAt = 0;
  let runInFlight = false;
  let rerunPending = false;
  let suspended = false;
  let suspendDepth = 0;
  let shortlistExpanded = false;   // survives re-renders

  function currentSignature() {
    const cards = RMScraper.findCards();
    if (!cards.length) return "0";
    const first = (cards[0].textContent || "").slice(0, 40);
    const last = (cards[cards.length - 1].textContent || "").slice(0, 40);
    return cards.length + "|" + first + "|" + last;
  }

  function suspend() {
    suspendDepth++;
    suspended = true;
    // Cancel any debounce/rerun the observer queued BEFORE we took ownership,
    // so a stale scan cannot fire the instant we resume and blank the panel.
    clearTimeout(debounceTimer);
    debounceTimer = null;
    firstPendingAt = 0;
    rerunPending = false;
  }
  function resume() {
    suspendDepth = Math.max(0, suspendDepth - 1);
    if (suspendDepth === 0) suspended = false;
  }

  // Wait until any in-flight run() has finished. A bulk scan must own the page
  // alone: if an observer-triggered run() is still rendering when the user
  // presses Bulk Scan a SECOND time, the two fight and the shortlist host ends
  // up blank ("second scan shows nothing, must reload tab"). We park briefly
  // until the page is quiet, then proceed.
  async function waitIdle(maxMs) {
    const t0 = Date.now();
    while (runInFlight && Date.now() - t0 < (maxMs || 4000)) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async function guardedRun() {
    if (runInFlight) { rerunPending = true; return; }
    runInFlight = true;
    try {
      await run();
    } catch (e) {
      console.log("RM: run gagal:", e && e.message);
    } finally {
      runInFlight = false;
      if (rerunPending) { rerunPending = false; setTimeout(fire, 300); }
    }
  }

  function fire() {
    debounceTimer = null;
    firstPendingAt = 0;
    const sig = currentSignature();
    if (sig === lastSig) return;      // product set genuinely unchanged
    lastSig = sig;
    guardedRun();
  }

  function scheduleRun(reason) {
    if (suspended) return;           // bulk scan owns the page right now
    const now = Date.now();
    if (!firstPendingAt) firstPendingAt = now;
    // MAX-WAIT: a permanently busy page must still get scanned.
    if (now - firstPendingAt >= MAX_WAIT_MS) {
      clearTimeout(debounceTimer);
      fire();
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fire, DEBOUNCE_MS);
  }

  function boot() {
    const obs = new MutationObserver((muts) => {
      if (suspended) return;
      // ignore mutations caused by our OWN panel, else we loop forever
      const ours = muts.every((m) => {
        const t = m.target;
        return t && t.closest && t.closest(".rm-panel, .rm-diag, .rm-modal-bg");
      });
      if (ours) return;
      scheduleRun("mutation");
    });
    obs.observe(document.body, { childList: true, subtree: true });

    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastSig = "";                // force a fresh scan on navigation
        scheduleRun("url");
      }
    }, 1000);

    // safety net: if nothing ever rendered (page too busy, late hydration),
    // retry a few times on a plain timer regardless of mutations.
    let tries = 0;
    const retry = setInterval(() => {
      tries++;
      if (tries > 6) { clearInterval(retry); return; }
      if (!document.querySelector(".rm-panel, .rm-diag")) {
        lastSig = "";
        scheduleRun("retry");
      } else {
        clearInterval(retry);
      }
    }, 2500);

    scheduleRun("init");
  }

  boot();
})();
