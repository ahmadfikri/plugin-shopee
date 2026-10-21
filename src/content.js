/* content.js — orchestrator. Runs on Shopee search pages: scrape -> analyze ->
 * inject panel -> wire actions. Everything stays inside the plugin. */
(function () {
  "use strict";
  const { RMStore, RMScraper, RMAnalytics, RMPanel, RMAi } = window;
  let lastAnalysis = null;
  // Activity log (activitylog.js). Never let logging break the plugin.
  function L(type, data) { try { if (window.RMLog) window.RMLog.log(type, data); } catch (_) {} }

  function isSearchPage() {
    // Marketplace search OR any affiliate.shopee page (product/search surfaces there).
    if (location.hostname.startsWith("affiliate.")) return true;
    return /\/search/.test(location.pathname) && /keyword=/.test(location.search);
  }

  // Where did the observer's auto-captured products come from?
  // NEVER location.pathname: that wrote "/offer/product_offer" into the
  // "Dari kata kunci" column of every auto-saved product, which is not a
  // keyword and made the column useless for deciding anything. Order of truth:
  //   1. what is actually typed in the page's product search box right now
  //   2. the marketplace ?keyword= parameter
  //   3. the active category tab (honest: that IS where the rows came from)
  //   4. nothing — a blank cell beats a misleading URL path
  // A search term is prefixed "cari: " so it matches the label bulk keyword
  // scans store, which is what the latest-batch lower-table filter compares.
  function observedLabel(a) {
    const urlKw = ((a && a.keyword) || "").trim();
    if (urlKw) return "cari: " + urlKw;
    try {
      const finder = window.RMBulk && window.RMBulk.findSearchInput;
      const box = typeof finder === "function" ? finder() : null;
      const typed = box && String(box.value || "").trim();
      if (typed) return "cari: " + typed;
    } catch (_) { /* a missing/blocked search box is not an error here */ }
    const tab = document.querySelector(
      ".ant-tabs-tab-active, [role='tab'][aria-selected='true']");
    const tabLabel = tab && (tab.textContent || "").trim();
    if (tabLabel) return tabLabel;
    return "";
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
  function renderShortlist(panel, expanded, keywordFilter) {
    if (!window.RMShortlist || !panel) return;
    const host = panel.querySelector(".rm-sl-host");
    if (!host) return;
    if (typeof expanded === "boolean") shortlistExpanded = expanded;
    if (arguments.length >= 3) shortlistKeywordFilter = keywordFilter || null;
    const isOpen = shortlistExpanded;
    // Renders are async (getMeta), and several can be in flight at once: a bulk
    // scan finishing, the observer re-saving a page, and the user clicking a
    // control. Without ordering, an EARLIER render that resolves LATER wins and
    // silently reverts the newer view — that is why "Lihat seluruh shortlist"
    // appeared dead: the click cleared the filter, then a slower in-flight render
    // repainted the filtered table over it. Only the newest render may write.
    const myToken = ++shortlistRenderToken;
    RMShortlist.getMeta().then((meta) => {
      if (myToken !== shortlistRenderToken) {         // superseded — do not paint
        L("shortlist-render-skip", { token: myToken, newest: shortlistRenderToken });
        return;
      }
      // pageLabel = the label products from the CURRENTLY OPEN page carry, so the
      // "Halaman ini" toggle can filter the one cumulative table down to them.
      const pageLabel = lastAnalysis ? observedLabel(lastAnalysis) : "";
      host.innerHTML = RMPanel.shortlistSection(meta, isOpen, shortlistKeywordFilter, pageLabel);
      {
        const all = (meta.items || []);
        const f = shortlistKeywordFilter;
        const matching = RMShortlist.filterItems(all, f).length;
        L("shortlist-render", {
          total: all.length, matchingFilter: matching, filter: f || null,
          expanded: isOpen, pageLabel,
          rowsInDom: host.querySelectorAll(".rm-sl-table tbody tr").length,
          hostAttached: document.contains(host),
          keywordsStored: Array.from(new Set(all.map((x) => x.keyword || ""))).slice(0, 15)
        });
      }
      // The progress line lives inside this host, so every re-render destroys it.
      // A finished scan re-rendered immediately, which wiped its own summary
      // ("Selesai — 2/2 kata kunci") microseconds after writing it: the user
      // could never read the result of a scan they just waited through. Re-paint
      // the last note so it survives until the next scan replaces it.
      if (shortlistNote) {
        const prog = host.querySelector(".rm-sl-progress");
        if (prog) { prog.textContent = shortlistNote; prog.style.display = "block"; }
      }
      const t = host.querySelector(".rm-sl-toggle");
      if (t) t.addEventListener("click", () => renderShortlist(panel, !isOpen));
      const all = host.querySelector(".rm-sl-all");
      if (all) all.addEventListener("click", () => renderShortlist(panel, false, null));
      const pageBtn = host.querySelector(".rm-sl-page");
      if (pageBtn) pageBtn.addEventListener("click", () =>
        renderShortlist(panel, true, pageBtn.getAttribute("data-label") || null));
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
        L("bulk-start", { mode: "kategori", tabs: tabs.length,
          tabLabels: tabs.slice(0, 15).map((t) => (t.textContent || "").trim().slice(0, 30)),
          includePages: !!(pagesCb && pagesCb.checked), cardsOnPage: RMScraper.findCards().length });
        bulk.disabled = true; bulk.textContent = "⏳ Memindai…";
        shortlistNote = "";     // a new crawl must not show the previous summary
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
                // Terminal line (done / stopped / start-with-no-tabs). Persist it
                // so the re-render in finally does not wipe the summary the user
                // waited for — same fix as the keyword scan path.
                shortlistNote = (s.note || s.phase) +
                  (s.total != null ? ` — total ${s.total} produk` : "");
                prog.textContent = shortlistNote;
              }
            }
          });
          L("bulk-end", { mode: "kategori", result: r });
          if (r && r.error && prog) {
            shortlistNote = r.error;
            prog.textContent = shortlistNote;
          } else if (r && r.runId) {
            // Bug 6 Okt: the crawl stored 180 products but the table still
            // showed the same cumulative top 20 (most were re-scans, the 14 new
            // ones ranked below), so it looked like bulk scan did nothing. End
            // on THIS run's results, new products first, with real counts.
            const seen = (r.added || 0) + (r.updated || 0);
            shortlistNote = (r.stopped ? "Dihentikan" : "Selesai") +
              ` — ${r.batches || 0} halaman dipindai, ${seen} produk: ` +
              `${r.added || 0} BARU, ${r.updated || 0} sudah ada (diperbarui). ` +
              `Total riset ${r.total} produk. Tabel di bawah = hasil scan ini; ` +
              `klik "Semua produk" untuk daftar kumulatif.`;
            if (prog) prog.textContent = shortlistNote;
            shortlistRunView = { filter: RMShortlist.RUN_PREFIX + r.runId };
          }
        } catch (err) {
          L("bulk-crash", { mode: "kategori", msg: String(err && err.message || err),
            stack: err && String(err.stack || "").slice(0, 800) });
          shortlistNote = "Gagal: " + (err && err.message || err);
          if (prog) prog.textContent = shortlistNote;
        } finally {
          resume();
          lastSig = "";   // page moved while suspended; allow a fresh scan
          bulk.disabled = false; bulk.textContent = "▶ Bulk Scan Semua Kategori";
          if (stopBtn) { stopBtn.style.display = "none"; stopBtn.textContent = "■ Stop"; }
          if (shortlistRunView) {
            const v = shortlistRunView; shortlistRunView = null;
            renderShortlist(panel, true, v.filter);
          } else {
            renderShortlist(panel, shortlistExpanded);
          }
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
        L("bulk-start", { mode: "keyword", keywords, cardsOnPage: RMScraper.findCards().length,
          searchBox: !!RMBulk.findSearchInput() });
        kwScan.disabled = true; kwScan.textContent = "⏳ Memindai…";
        shortlistNote = "";     // a new scan must not show the previous summary
        shortlistKeywordFilter = null;   // start from a clean, unfiltered view
        if (stopBtn) stopBtn.style.display = "";
        if (prog) prog.style.display = "block";
        suspend();
        await waitIdle();   // let any in-flight render finish before we take over
        let scanResult = null;
        try {
          scanResult = await RMBulk.runKeywords({
            cfg: await loadCfg(),
            keywords,
            // Fresh list per bulk search, but wiped LAZILY inside runKeywords —
            // only right before the first batch it can actually store, so a scan
            // that verifies nothing leaves the existing research untouched.
            clearFirst: true,
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
                // Terminal line (done / stopped). Remember it: the re-render in
                // finally rebuilds this element, and the summary the user waited
                // for must survive that.
                shortlistNote = (s.note || s.phase) +
                  (s.total != null ? ` — total ${s.total} produk` : "");
                prog.textContent = shortlistNote;
              }
            }
          });
          L("bulk-end", { mode: "keyword", result: scanResult });
          if (scanResult && scanResult.error && prog) {
            shortlistNote = scanResult.error;
            prog.textContent = shortlistNote;
          }
        } catch (err) {
          L("bulk-crash", { mode: "keyword", msg: String(err && err.message || err),
            stack: err && String(err.stack || "").slice(0, 800) });
          shortlistNote = "Gagal: " + (err && err.message || err);
          if (prog) prog.textContent = shortlistNote;
        } finally {
          resume();
          lastSig = "";
          kwScan.disabled = false; kwScan.textContent = "🔎 Bulk Scan Keyword";
          if (stopBtn) { stopBtn.style.display = "none"; stopBtn.textContent = "■ Stop"; }
          if (scanResult && scanResult.lastKeyword) {
            renderShortlist(panel, true, scanResult.lastKeyword);
          } else {
            renderShortlist(panel, shortlistExpanded);
          }
        }
      });
    });
  }

  function sortTable(button) {
    const table = button && button.closest("table");
    const body = table && table.querySelector("tbody");
    if (!body) return;
    const col = Number(button.getAttribute("data-col"));
    const type = button.getAttribute("data-type") || "text";
    const prev = button.getAttribute("data-dir");
    const dir = prev === "desc" ? "asc" : "desc";
    table.querySelectorAll(".rm-sort").forEach((b) => {
      b.textContent = "↕"; b.removeAttribute("data-dir");
    });
    button.setAttribute("data-dir", dir);
    button.textContent = dir === "asc" ? "↑" : "↓";
    const rows = Array.from(body.querySelectorAll("tr"));
    const value = (row) => {
      const cell = row.children[col];
      const raw = cell ? (cell.getAttribute("data-sort") || cell.textContent || "") : "";
      if (type === "number") {
        const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
        return Number.isFinite(n) ? n : -Infinity;
      }
      return String(raw).toLocaleLowerCase("id-ID");
    };
    rows.sort((a, b) => {
      const av = value(a), bv = value(b);
      const cmp = type === "number" ? av - bv : av.localeCompare(bv, "id-ID");
      return dir === "asc" ? cmp : -cmp;
    });
    rows.forEach((row) => body.appendChild(row));
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
    const logBtn = panel.querySelector(".rm-log-export");
    if (logBtn && window.RMLog) logBtn.addEventListener("click", async () => {
      const n = await RMLog.exportFile();
      logBtn.textContent = `✓ ${n} baris log diunduh`;
      setTimeout(() => { logBtn.textContent = "⬇ Log aktivitas"; }, 2500);
    });
    const logClr = panel.querySelector(".rm-log-clear");
    if (logClr && window.RMLog) logClr.addEventListener("click", async () => {
      if (!confirm("Hapus seluruh log aktivitas?")) return;
      await RMLog.clear();
      L("log-cleared", {});
    });

    panel.addEventListener("click", async (e) => {
      const sorter = e.target.closest && e.target.closest(".rm-sort");
      if (sorter) { sortTable(sorter); return; }
      // ---- drill-down: click a product name -> deep-analysis modal ----
      const drill = e.target.closest && e.target.closest(".rm-drill");
      if (drill) {
        const id = drill.getAttribute("data-id");
        const p = lastAnalysis && lastAnalysis.products.find((x) => x.id === id);
        if (!p) {
          // Row is from an EARLIER page (bulk scan history), so we do not hold a
          // full product object with rendered detail. Deep analysis needs the
          // rendered product page — open it in Shopee rather than showing an
          // empty modal.
          const entry = await shortlistEntry(id);
          const href = entry && entry.href;
          if (href) window.open(href, "_blank", "noopener");
          else alert("Produk ini dari scan halaman lain — buka lewat 🔗 untuk analisa mendalam.");
          return;
        }
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
      if (!id) return;
      // Prefer the full product object from the current page; fall back to the
      // stored shortlist entry (minimal shape) for rows from earlier scans.
      let p = lastAnalysis && lastAnalysis.products.find((x) => x.id === id);
      if (!p) {
        const entry = await shortlistEntry(id);
        if (!entry) return;
        p = {
          id: entry.id, name: entry.name, price: entry.price, href: entry.href,
          rating: entry.rating, unitsPerMonth: entry.unitsPerMonth,
          revenuePerMonth: null,
          pro: { action: entry.action, pro: entry.pro, economics: {} }
        };
      }

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

  // Look up one stored shortlist entry by id (for action buttons on rows that
  // came from an earlier page and are not in lastAnalysis).
  async function shortlistEntry(id) {
    if (!id || !window.RMShortlist) return null;
    try {
      const items = await RMShortlist.getAll();
      return (items || []).find((x) => String(x.id) === String(id)) || null;
    } catch (_) { return null; }
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

  function showExperiment(modal, exp) {
    const host = modal && modal.querySelector(".rm-exp");
    if (!host || !exp) return;
    if (exp.error) {
      host.innerHTML = "";
      const msg = document.createElement("span");
      msg.className = "rm-red";
      msg.textContent = "⚠ " + exp.error;
      host.appendChild(msg);
      return;
    }
    host.innerHTML = "";
    const label = document.createElement("b");
    label.textContent = "Campaign Meta = Tag Shopee";
    const code = document.createElement("code");
    code.textContent = exp.campaignTag;
    const copy = document.createElement("button");
    copy.className = "rm-exp-copy";
    copy.textContent = "Copy ID";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(exp.campaignTag); } catch (_) {}
      copy.textContent = "✓ Tersalin";
      setTimeout(() => { copy.textContent = "Copy ID"; }, 1800);
    });
    const meta = document.createElement("span");
    meta.textContent = `${exp.concept || "konsep"} · base ${exp.baseTag}`;
    host.append(label, code, copy, meta);
  }
  // Zero typing: create/reuse one Experiment ID and feed its generated
  // hypothesis to the Learning Ledger. Never block content generation.
  async function autoLog(p) {
    try {
      if (!window.RMExperiment) return null;
      const exp = await RMExperiment.ensure(p, p.__concept || null);
      if (window.RMConceptPerf && exp.concept) {
        await RMConceptPerf.log(exp.campaignTag, exp.concept, exp.experimentId);
      }
      if (window.RMLedger) {
        const detail = (window.RMDetailScrape && RMDetailScrape.isProductPage())
          ? RMDetailScrape.scrapeDetail() : {};
        await RMLedger.add({
          tag: exp.campaignTag,
          experimentId: exp.experimentId,
          baseTag: exp.baseTag,
          reasoning: exp.hypothesis,
          source: "plugin",
          concept: exp.concept,
          product: {
            name: p.name, href: p.href,
            category: (detail && (detail.categoryL1 || detail.category)) || null,
            price: p.price,
            rating: p.rating != null ? p.rating : (detail && detail.rating)
          }
        });
      }
      return exp;
    } catch (err) {
      return { error: (err && err.message) || "Experiment ID gagal disimpan" };
    }
  }

  function wireModal(modal, p) {
    const cfgP = RMStore.getConfig();
    modal.querySelector(".rm-modal-x") && modal.querySelector(".rm-modal-x").addEventListener("click", () => modal.remove());
    // Backdrop click closes an OVERLAY modal only. The inline product-page panel
    // has no backdrop — its padding is page space, so a stray click there must
    // not delete the panel.
    modal.addEventListener("click", (e) => {
      if (e.target === modal && !modal.classList.contains("rm-inline")) modal.remove();
    });
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
      try {
        const cap = await RMAi.generateCaption(cfg, p);
        const exp = await autoLog(p);
        showExperiment(modal, exp);
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
    const gp = modal.querySelector(".rm-gahwa");
    if (gp) gp.addEventListener("click", async () => {
      gp.disabled = true;
      gp.textContent = "mengunduh…";
      let r;
      try { r = await window.RMGahwa.download(); } catch (err) { r = { ok: false, error: String(err && err.message || err) }; }
      L("gahwa-pack", { ok: r.ok, folder: r.folder, images: r.images, video: r.video, files: r.files,
                        failed: r.failed ? r.failed.length : 0, error: r.error || null });
      let st = modal.querySelector(".rm-gahwa-status");
      if (!st) { st = document.createElement("div"); st.className = "rm-note rm-gahwa-status"; gp.closest(".rm-foot").before(st); }
      st.textContent = r.ok
        ? `🎞 Gahwa Pack tersimpan di Downloads/${r.folder}/ — ${r.images} gambar${r.video ? " + video" : ""} + gahwa_job.json`
        : `Gahwa Pack gagal: ${r.error || (r.failed || []).map((f) => f.filename.split("/").pop() + ": " + f.error).join("; ")}`;
      gp.disabled = false;
      gp.textContent = "🎞 Gahwa Pack";
    });
    const vp = modal.querySelector(".rm-vprompt");
    if (vp) vp.addEventListener("click", async () => {
      const cfg = await cfgP;
      vp.textContent = "membuat…";
      try {
        const prompt = await RMAi.generateVideoPrompt(cfg, p);
        const exp = await autoLog(p);
        showExperiment(modal, exp);
        const mode = RMAi.videoMode ? RMAi.videoMode(cfg, p) : "";
        await showOutput(modal,
          "Prompt Video (Veo/Gemini)" + (mode ? " — " + mode : ""), prompt,
          "Buka Google Flow/Veo atau Gemini → tempel prompt (sudah berupa perintah 'Buatkan video…') → drag gambar produk sebagai referensi (Ingredients to Video) → generate.");
      } catch (err) { alert("Prompt video: " + err.message); }
      vp.textContent = "🎬 Prompt Video";
    });
    const freshExp = modal.querySelector(".rm-exp-new");
    if (freshExp && window.RMExperiment) freshExp.addEventListener("click", () => {
      RMExperiment.reset(p);
      const host = modal.querySelector(".rm-exp");
      if (host) host.innerHTML =
        "<b>Eksperimen baru siap</b><span>Generate lagi: konsep diputar dan ID baru dibuat otomatis.</span>";
      const out = modal.querySelector(".rm-out");
      if (out) out.style.display = "none";
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
      const priceRoot = document.querySelector(
        "[class*='product-briefing' i], [class*='product-detail' i], main") || document.body;
      priceRoot.querySelectorAll(
        "[class*='price' i], [aria-label*='Rp'], span"
      ).forEach((el) => {
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
          if (m && m.tag) product.suggestedTag = m.tag;
          // v0.9.26: niche from the breadcrumb (fallback: name keywords) so a
          // new product is shrunk toward its own family, not the global mean.
          const nc = window.RMNiche
            ? RMNiche.classify({ name: product.name, categoryL1: d.categoryL1 }) : null;
          product.niche = nc ? nc.niche : null;
          product.nicheSource = nc ? nc.source : null;
          product.categoryL1 = d.categoryL1 || null;
          // Cost per click, not the product's earnings ceiling — see the matching
          // note in analytics.js.
          epcPred = RMEpc.predict(model, {
            tag: (m && m.tag) ? m.tag : null,        // .tag — matchTag returns an object
            niche: product.niche,
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
      const detailData = {
        error: null, name: d.name, price, rating: d.rating,
        totalReviews: d.totalReviews, starBreakdown: d.starBreakdown,
        historicalSold: d.historicalSold, likedCount: d.likedCount,
        stock: d.inStock ? "IN STOCK" : null, isOfficial: false
      };
      // v0.9.25: product pages get the decision-first panel (productpage.js).
      // The search-page drill-down keeps RMPanel.buildDetailModal.
      const modal = window.RMProductPage
        ? RMProductPage.build(product, detailData, product.pro, epcPred, cfg)
        : RMPanel.buildDetailModal(product, detailData, product.pro, epcPred);
      // detail-page: render inline (not as overlay) so it sits with the page
      modal.classList.add("rm-inline");
      (document.querySelector("main") || document.body).prepend(modal);
      wireModal(modal, product);
      if (window.RMProductPage && modal.classList.contains("rm-pp-root")) {
        RMProductPage.fillHistory(modal, product, cfg.__perf)
          .catch((e) => console.log("RM: riwayat eksperimen gagal:", e && e.message));
      }
      lastAnalysis = { products: [product] };
      // AUTO-CAPTURE (Fikri: "biarkan data collector jalan tanpa pencet save").
      // Detail pages yield the RICHEST rows — rating, reviews, stars, sold, video.
      // Fire-and-forget: never let a storage hiccup break the panel.
      if (window.RMDataset && cfg.autoCapture !== false) {
        RMDataset.capture({
          name: d.name, price, rating: d.rating, totalReviews: d.totalReviews,
          starBreakdown: d.starBreakdown, historicalSold: d.historicalSold,
          likedCount: d.likedCount, inStock: d.inStock,
          shopid: d.shopid, itemid: d.itemid, categoryL1: d.categoryL1 || null
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
    if (suspended) { L("run-abort", { reason: "bulk scan sedang jalan" }); return; }
    const snap = RMScraper.scrapePage();
    L("page-scan", { url: location.href.slice(0, 200), cards: RMScraper.findCards().length,
      parsed: snap.products.length, panelsRemoved: document.querySelectorAll(".rm-panel, .rm-diag").length });

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
        `Buka DevTools Console → cari log "RM:". Kirim potongan HTML satu kartu produk ke Kiro untuk kalibrasi.` +
        `<div><button class="rm-log-export">⬇ Log aktivitas</button></div></div>`;
      (document.querySelector("main") || document.body).prepend(diag);
      const dl = diag.querySelector(".rm-log-export");
      if (dl && window.RMLog) dl.addEventListener("click", () => RMLog.exportFile());
      L("diag-zero-products", { host: location.hostname, path: location.pathname,
        cards: RMScraper.findCards().length,
        firstCardHtml: (RMScraper.findCards()[0] && RMScraper.findCards()[0].outerHTML || "").slice(0, 1500) });
      console.log("RM: 0 produk. host=", location.hostname, "path=", location.pathname);
      console.log("RM: cards ditemukan oleh findCards() =", RMScraper.findCards().length);
      return;
    }

    const a = RMAnalytics.analyze(snap, cfg);
    lastAnalysis = a;
    RMStore.saveSnapshot({
      keyword: a.keyword, at: a.scrapedAt, marketSize: a.marketSize,
      productCount: a.productCount
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
      const lbl = observedLabel(a);
      RMShortlist.add(a.products, observedLabel(a))
        .then((r) => { L("page-store", { label: lbl, analyzed: a.products.length,
          scored: a.products.filter((p) => p && p.pro).length, added: r.added, updated: r.updated, total: r.total });
          renderShortlist(panel); })
        .catch((err) => { L("page-store-error", { label: lbl, msg: String(err && err.message || err) });
          renderShortlist(panel); });
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
  // Monotonic render ticket: see renderShortlist(). Guarantees that of several
  // concurrent async renders, only the most recently requested one paints.
  let shortlistRenderToken = 0;
  let shortlistKeywordFilter = null; // latest successful bulk keyword batch
  // Last terminal scan message, re-painted after each re-render so a finished
  // scan's summary stays readable instead of vanishing with the element.
  let shortlistNote = "";
  let shortlistRunView = null;     // set by a finished category crawl

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
      L("run-crash", { msg: String(e && e.message || e), stack: e && String(e.stack || "").slice(0, 800) });
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
