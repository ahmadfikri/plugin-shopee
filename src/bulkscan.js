/* bulkscan.js — AUTOMATIC bulk scan.
 *
 * Walks the affiliate offer page's own category tabs (and pagination when
 * present) by itself, scraping + accumulating each batch into the cumulative
 * shortlist. One press turns "20 produk on this page" into hundreds across
 * every category.
 *
 * Deliberate safety choices:
 *  - HUMAN-PACED: a configurable delay between steps (default 2.5s) plus a wait
 *    for the product set to actually change. Shopee has anti-bot; hammering it
 *    would risk Fikri's own session, so this is intentionally unhurried.
 *  - STOPPABLE at any moment; state is saved after every batch, so a stop (or a
 *    page reload) never loses what was already collected.
 *  - It only CLICKS controls that already exist on the page — no direct API
 *    calls, no URL crawling, nothing the user could not click themselves.
 */
(function (global) {
  "use strict";

  // Hard ceiling on how many products one keyword bulk scan will analyse across
  // all its result pages. Keeps a huge keyword ("case") from running away and
  // from hammering Shopee's anti-bot. (Fikri: maksimal 200 produk.)
  const MAX_ANALYZE = 200;

  // Hard ceiling on result pages walked per keyword — a second, independent
  // brake so pagination cannot spin even if the product cap is never reached.
  const MAX_PAGES = 12;

  let running = false;
  let stopRequested = false;

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // Category tabs on the affiliate offer page ("All", "Commissions XTRA",
  // "Mobile & Accessories", …). Falls back to any tab-like control.
  function findCategoryTabs() {
    const sels = [
      ".ant-tabs-tab",
      "[role='tab']",
      "[class*='TabItem']",
      "[class*='tab-item']"
    ];
    for (const s of sels) {
      const nodes = Array.from(document.querySelectorAll(s))
        .filter((n) => (n.textContent || "").trim().length > 1);
      if (nodes.length > 1) return nodes;
    }
    return [];
  }

  // "next page" control, if the listing is paginated.
  function findNextPage() {
    const cands = [
      ".ant-pagination-next:not(.ant-pagination-disabled)",
      "[class*='pagination'] [class*='next']:not([class*='disabled'])",
      "button[aria-label='Next Page']"
    ];
    for (const s of cands) {
      const n = document.querySelector(s);
      if (n && !/disabled/i.test(n.className || "")) return n;
    }
    return null;
  }

  function signature() {
    const cards = global.RMScraper ? global.RMScraper.findCards() : [];
    if (!cards.length) return "0";
    // Count + several card identities. The old first-card/40-char signature
    // collided often, so a new result could look unchanged (or stale cards could
    // look ready). href/data-id survive React text/layout churn better.
    const ids = cards.slice(0, 6).map((c) =>
      c.getAttribute && (c.getAttribute("data-itemid") || c.getAttribute("data-id")) ||
      (c.querySelector && c.querySelector("a[href]") && c.querySelector("a[href]").href) ||
      (c.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90));
    return cards.length + "|" + ids.join("|");
  }

  function pageLoading() {
    // ONLY real, framework-owned busy indicators. This used to also match
    // [class*='loading' i], which is far too broad for a React/antd page: a
    // permanently-visible node like `image-loading` / `lazyloading` /
    // `loadingWrapper` made this return true FOREVER, so waitForSearchResult
    // could never satisfy `transitioned && !loading` and every keyword came back
    // "hasil baru tidak terverifikasi" — 0/1 kata kunci, 0 produk, even though the
    // results were plainly on screen. Category scan was unaffected because it uses
    // waitForChange(), which never consults this function; that asymmetry is what
    // identified the bug.
    const nodes = Array.from(document.querySelectorAll(
      ".ant-spin-spinning, .ant-skeleton-active, [aria-busy='true']"));
    return nodes.some((n) => n.offsetParent !== null &&
      n.getAttribute("aria-hidden") !== "true");
  }

  // Wait until the visible product set actually changes (or timeout).
  async function waitForChange(prevSig, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 8000)) {
      if (stopRequested) return false;
      await sleep(400);
      if (signature() !== prevSig) { await sleep(600); return true; }
    }
    return false;
  }

  // Keyword searches must prove a transition away from the previous results,
  // then settle on one non-loading signature twice. Never accept old stable cards.
  async function waitForSearchResult(prevSig, timeoutMs) {
    const t0 = Date.now();
    const budget = timeoutMs || 15000;
    // After this much time we stop trusting the busy indicator: a spinner that is
    // still "on" while the card set has gone quiet is a stuck widget, not a search
    // in flight. Without this escape the whole scan is hostage to one node.
    const IGNORE_LOADING_AFTER = Math.min(6000, Math.floor(budget / 2));
    let transitioned = false, stable = 0, last = null;
    while (Date.now() - t0 < budget) {
      if (stopRequested) return { ready: false, stopped: true, cards: 0 };
      await sleep(450);
      const sig = signature();
      const elapsed = Date.now() - t0;
      const loading = pageLoading() && elapsed < IGNORE_LOADING_AFTER;
      if (loading || sig !== prevSig) transitioned = true;
      if (transitioned && !loading && sig !== "0") {
        if (sig === last) {
          stable++;
          if (stable >= 2) {
            const cards = global.RMScraper ? global.RMScraper.findCards().length : 0;
            return { ready: true, stopped: false, cards };
          }
        } else {
          last = sig; stable = 0;
        }
      }
    }
    return { ready: false, stopped: false, cards: 0 };
  }

  async function scrapeAndStore(label, cfg) {
    if (!global.RMScraper || !global.RMAnalytics || !global.RMShortlist) return 0;
    const snap = global.RMScraper.scrapePage();
    if (!snap.products.length) return 0;
    const a = global.RMAnalytics.analyze(snap, cfg);
    const res = await global.RMShortlist.add(a.products, label);
    return res.total;
  }

  function isRunning() { return running; }
  function stop() { stopRequested = true; }

  /* Run the crawl.
   * opts: { cfg, delayMs, maxSteps, includePages, onProgress(step) }
   * onProgress receives { phase, label, index, of, total, note }
   */
  async function run(opts) {
    if (running) return { error: "Bulk scan sudah berjalan." };
    running = true; stopRequested = false;
    const cfg = opts.cfg;
    const delay = opts.delayMs || 2500;
    const maxSteps = opts.maxSteps || 40;
    const report = opts.onProgress || function () {};
    let steps = 0, total = 0;

    try {
      const tabs0 = findCategoryTabs();
      // Capture LABELS, not node references. Shopee (React) REPLACES tab nodes on
      // every re-render — and a search rebuilds the whole list — so a held node
      // becomes detached and .click() silently does nothing. That was the
      // "bulk scan error setelah search" bug. We re-find the tab by label each
      // iteration instead.
      const labels = tabs0.map((n, i) =>
        (n.textContent || "").trim().slice(0, 40) || ("kategori " + (i + 1)));
      report({ phase: "start", note: labels.length
        ? `Menemukan ${labels.length} kategori. Mulai menelusuri…`
        : "Tidak menemukan tab kategori — memindai halaman ini saja." });

      // always capture the current view first
      total = await scrapeAndStore(currentLabel(), cfg);
      report({ phase: "scan", label: currentLabel(), index: 0, of: labels.length, total });

      for (let i = 0; i < labels.length && steps < maxSteps; i++) {
        if (stopRequested) { report({ phase: "stopped", total }); break; }
        const label = labels[i];
        const tab = findTabByLabel(label);      // FRESH node every time
        if (!tab) {
          report({ phase: "skip", label, index: i + 1, of: labels.length, total,
                   note: "tab tidak ada lagi di DOM" });
          continue;
        }
        const prev = signature();
        try { tab.click(); } catch (_) { continue; }
        steps++;
        const changed = await waitForChange(prev, 9000);
        if (!changed) {
          report({ phase: "skip", label, index: i + 1, of: labels.length, total,
                   note: "tidak ada perubahan / kosong" });
          continue;
        }
        total = await scrapeAndStore(label, cfg);
        report({ phase: "scan", label, index: i + 1, of: labels.length, total });
        await sleep(delay);

        // optional: walk pagination inside this category
        if (opts.includePages) {
          for (let pg = 0; pg < 5 && steps < maxSteps; pg++) {
            if (stopRequested) break;
            const next = findNextPage();
            if (!next) break;
            const prevP = signature();
            try { next.click(); } catch (_) { break; }
            steps++;
            if (!(await waitForChange(prevP, 9000))) break;
            total = await scrapeAndStore(label + " · hal " + (pg + 2), cfg);
            report({ phase: "scan", label: label + " · hal " + (pg + 2),
                     index: i + 1, of: labels.length, total });
            await sleep(delay);
          }
        }
      }
      report({ phase: stopRequested ? "stopped" : "done", total, note:
        stopRequested ? "Dihentikan oleh pengguna." : "Selesai." });
      return { total, steps, stopped: stopRequested };
    } finally {
      running = false; stopRequested = false;
    }
  }

  // Re-find a tab by its visible label. MUST be used instead of caching nodes:
  // React replaces tab elements on re-render (and a search rebuilds them), so a
  // cached node is detached and clicking it does nothing.
  function findTabByLabel(label) {
    const want = String(label || "").trim().toLowerCase();
    if (!want) return null;
    const tabs = findCategoryTabs();
    let exact = null, partial = null;
    for (const t of tabs) {
      const txt = (t.textContent || "").trim().toLowerCase();
      if (txt === want) { exact = t; break; }
      if (!partial && txt && (txt.includes(want) || want.includes(txt))) partial = t;
    }
    return exact || partial;
  }

  // The affiliate offer page's product search box. Strong selectors first;
  // generic text inputs are accepted only when product-offer context is nearby.
  function findSearchInput() {
    const strong = [
      "input[placeholder*='Search Product' i]",
      "input[placeholder*='Cari Produk' i]",
      "input[placeholder*='Search' i]",
      "input[placeholder*='Cari' i]",
      "input[type='search']"
    ];
    for (const s of strong) {
      const n = document.querySelector(s);
      if (n && n.offsetParent !== null && !n.disabled) return n;
    }
    const generic = Array.from(document.querySelectorAll("input.ant-input[type='text'], input[type='text']"))
      .filter((n) => n.offsetParent !== null && !n.disabled);
    return generic.find((n) => {
      const box = n.closest("form, [class*='search' i], [class*='filter' i]") || n.parentElement;
      return /produk|product|search|cari/i.test((box && box.textContent) || "");
    }) || (generic.length === 1 ? generic[0] : null);
  }

  function findSearchButton(input) {
    if (!input) return null;
    // Search beside THIS input, not a global button that merely contains "cari".
    let scope = input.closest("form, [class*='search' i], .ant-input-search") || input.parentElement;
    for (let depth = 0; scope && depth < 3; depth++, scope = scope.parentElement) {
      const btns = Array.from(scope.querySelectorAll("button, .ant-btn"));
      const found = btns.find((b) =>
        !b.disabled && (/^(search|cari)$/i.test((b.textContent || "").trim()) ||
        /search|cari/i.test(b.getAttribute("aria-label") || "") ||
        b.type === "submit"));
      if (found) return found;
    }
    return null;
  }

  // Type into a React-controlled input so the framework registers the value.
  function setInputValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(proto, "value") &&
      Object.getOwnPropertyDescriptor(proto, "value").set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function pressEnter(input) {
    for (const type of ["keydown", "keypress", "keyup"]) {
      input.dispatchEvent(new KeyboardEvent(type, {
        key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true
      }));
    }
  }

  // Wait until product cards are ACTUALLY rendered (not just the DOM changing).
  // This is the anti-bot guard Fikri asked for: never fire the next search until
  // the previous one has visibly finished rendering.
  async function waitForRender(minCards, timeoutMs) {
    const need = minCards || 1;
    const t0 = Date.now();
    let stable = 0, lastCount = -1;
    while (Date.now() - t0 < (timeoutMs || 12000)) {
      await sleep(500);
      const cards = global.RMScraper ? global.RMScraper.findCards() : [];
      if (cards.length >= need) {
        // require the count to hold steady twice = rendering settled
        if (cards.length === lastCount) { stable++; if (stable >= 2) return cards.length; }
        else { stable = 0; }
        lastCount = cards.length;
      }
    }
    return 0;
  }

  /* Bulk scan by SEARCH KEYWORD.
   * opts: { cfg, keywords: [..], delayMs, onProgress }
   * For each keyword: type -> submit -> WAIT FOR RENDER -> scrape -> pause.
   */
  async function runKeywords(opts) {
    if (running) return { error: "Bulk scan sudah berjalan." };
    const seen = new Set();
    const keywords = (opts.keywords || []).map((k) => String(k).trim()).filter((k) => {
      const key = k.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });
    if (!keywords.length) return { error: "Daftar kata kunci kosong." };

    running = true; stopRequested = false;
    const cfg = opts.cfg;
    const delay = opts.delayMs || 3000;
    const report = opts.onProgress || function () {};
    let total = 0, done = 0, lastKeyword = null;

    // Fikri wants a fresh list per bulk search, but clearing at the START was a
    // data-loss trap: when the scan then verified nothing (0/1 kata kunci) he was
    // left with an EMPTY table and his previous research gone. So the wipe is
    // LAZY — it happens once, immediately before the first batch we are actually
    // able to store. A scan that finds nothing now changes nothing.
    let cleared = false;
    async function clearOnceBeforeStoring() {
      if (cleared || !opts.clearFirst) return;
      cleared = true;
      try { if (global.RMShortlist) await global.RMShortlist.clear(); } catch (_) {}
    }

    try {
      if (!findSearchInput()) {
        report({ phase: "error", note: "Kotak pencarian produk tidak ditemukan." });
        return { error: "no search input" };
      }
      report({ phase: "start", note: "Menunggu halaman siap sebelum mulai…" });
      await waitForRender(1, 10000);

      for (let i = 0; i < keywords.length; i++) {
        if (stopRequested) break;
        const kw = keywords[i];
        let result = { ready: false, stopped: false, cards: 0 };

        // One retry handles React occasionally swallowing Enter/click while its
        // controlled input is being re-mounted. Each attempt re-queries both
        // input and its LOCAL button; stale nodes are never reused.
        for (let attempt = 0; attempt < 2 && !result.ready && !stopRequested; attempt++) {
          report({ phase: "search", label: kw, index: i + 1, of: keywords.length,
                   total, note: attempt ? "hasil belum berubah — coba ulang sekali…" : "mencari…" });
          const live = findSearchInput();
          if (!live) break;
          const prev = signature();
          setInputValue(live, "");
          await sleep(80);
          setInputValue(live, kw);
          await sleep(450);
          const btn = findSearchButton(live);
          if (btn) {
            try { btn.click(); } catch (_) { pressEnter(live); }
          } else {
            pressEnter(live);
          }
          result = await waitForSearchResult(prev, 15000);
        }

        if (stopRequested || result.stopped) break;
        if (!result.ready) {
          report({ phase: "skip", label: kw, index: i + 1, of: keywords.length,
                   total, note: "hasil baru tidak terverifikasi; data lama tidak disimpan" });
          await sleep(delay);
          continue;
        }

        await clearOnceBeforeStoring();   // wipe old list only now that we CAN store
        total = await scrapeAndStore("cari: " + kw, cfg);
        done++;
        lastKeyword = "cari: " + kw;
        report({ phase: "scan", label: kw, index: i + 1, of: keywords.length, total,
                 note: `${result.cards} produk baru selesai render (hal 1)` });
        await sleep(delay);

        // Walk THIS keyword's result pages (pagination "1 2 3 4 5 …"), not just
        // page 1. Fikri: untuk keyword spesifik, ikuti halaman berikutnya, bukan
        // pindah tab. Hard cap MAX_ANALYZE (200) products.
        //
        // THREE stop conditions, all required. The cap ALONE is not enough: if a
        // page stores no NEW product the running total never grows, `total < 200`
        // stays true forever and the crawl keeps clicking "next" endlessly — the
        // "pages gak berenti" bug. So we also stop after MAX_PAGES and after two
        // consecutive pages that added nothing.
        let noProgress = 0;
        for (let pg = 2; total < MAX_ANALYZE && pg <= MAX_PAGES + 1 && !stopRequested; pg++) {
          const next = findNextPage();
          if (!next) break;                       // no more pages for this keyword
          const prevP = signature();
          try { next.click(); } catch (_) { break; }
          const pageResult = await waitForSearchResult(prevP, 15000);
          if (stopRequested || pageResult.stopped) break;
          if (!pageResult.ready) {
            report({ phase: "skip", label: kw + " · hal " + pg, index: i + 1,
                     of: keywords.length, total, note: "halaman berikutnya tidak terverifikasi" });
            break;
          }
          const before = total;
          total = await scrapeAndStore("cari: " + kw, cfg);
          if (total <= before) {
            noProgress++;
            report({ phase: "skip", label: kw + " · hal " + pg, index: i + 1,
                     of: keywords.length, total, note: "tidak ada produk baru di halaman ini" });
            if (noProgress >= 2) break;           // two dead pages: stop, do not spin
          } else {
            noProgress = 0;
            report({ phase: "scan", label: kw + " · hal " + pg, index: i + 1,
                     of: keywords.length, total,
                     note: `${pageResult.cards} produk (hal ${pg}) · total ${total}/${MAX_ANALYZE}` });
          }
          await sleep(delay);
        }
        if (total >= MAX_ANALYZE) {
          report({ phase: "scan", label: kw, index: i + 1, of: keywords.length, total,
                   note: `batas ${MAX_ANALYZE} produk tercapai — berhenti menelusuri halaman` });
          break;   // cap reached: stop scanning further keywords too
        }
      }

      report({ phase: stopRequested ? "stopped" : "done", total,
               note: stopRequested ? "Dihentikan oleh pengguna."
                                   : `Selesai — ${done}/${keywords.length} kata kunci.` });
      return { total, done, lastKeyword, stopped: stopRequested };
    } finally {
      running = false; stopRequested = false;
    }
  }

  function currentLabel() {
    const active = document.querySelector(
      ".ant-tabs-tab-active, [role='tab'][aria-selected='true']");
    const t = active && (active.textContent || "").trim();
    return t || new URLSearchParams(location.search).get("keyword") || "halaman ini";
  }

  global.RMBulk = { run, runKeywords, stop, isRunning, findCategoryTabs,
                    findTabByLabel, findNextPage, findSearchInput, findSearchButton,
                    waitForRender, waitForSearchResult, currentLabel,
                    _signature: signature };
})(typeof window !== "undefined" ? window : this);
