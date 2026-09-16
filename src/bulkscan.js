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
    return cards.length + "|" + (cards[0].textContent || "").slice(0, 40);
  }

  // Wait until the visible product set actually changes (or timeout).
  async function waitForChange(prevSig, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 8000)) {
      await sleep(400);
      if (signature() !== prevSig) { await sleep(600); return true; }
    }
    return false;
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

  // The affiliate offer page's product search box.
  function findSearchInput() {
    const sels = [
      "input[placeholder*='Search' i]",
      "input[placeholder*='Cari' i]",
      ".ant-input[type='text']",
      "input.ant-input",
      "input[type='search']",
      "input[type='text']"
    ];
    for (const s of sels) {
      const n = document.querySelector(s);
      if (n && n.offsetParent !== null) return n;   // must be visible
    }
    return null;
  }

  function findSearchButton() {
    const btns = Array.from(document.querySelectorAll("button, .ant-btn"));
    return btns.find((b) => /^(search|cari)$/i.test((b.textContent || "").trim()))
      || btns.find((b) => /search|cari/i.test((b.textContent || "").trim()))
      || null;
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
    const keywords = (opts.keywords || []).map((k) => String(k).trim()).filter(Boolean);
    if (!keywords.length) return { error: "Daftar kata kunci kosong." };

    running = true; stopRequested = false;
    const cfg = opts.cfg;
    const delay = opts.delayMs || 3000;     // slower than tab-walking on purpose
    const report = opts.onProgress || function () {};
    let total = 0, done = 0;

    try {
      const input = findSearchInput();
      if (!input) {
        report({ phase: "error", note: "Kotak pencarian tidak ditemukan di halaman ini." });
        return { error: "no search input" };
      }

      // Make sure the page is settled BEFORE the first search, so we never stack
      // requests on a still-loading page.
      report({ phase: "start", note: "Menunggu halaman siap sebelum mulai…" });
      await waitForRender(1, 10000);

      for (let i = 0; i < keywords.length; i++) {
        if (stopRequested) { report({ phase: "stopped", total }); break; }
        const kw = keywords[i];
        report({ phase: "search", label: kw, index: i + 1, of: keywords.length, total,
                 note: "mencari…" });

        const live = findSearchInput();
        if (!live) { report({ phase: "skip", label: kw, index: i + 1, of: keywords.length,
                              total, note: "kotak pencarian hilang" }); continue; }
        const prev = signature();
        setInputValue(live, kw);
        await sleep(500);                   // let React register the value
        const btn = findSearchButton();
        if (btn) { try { btn.click(); } catch (_) { pressEnter(live); } }
        else pressEnter(live);

        // wait for the result set to change AND finish rendering
        await waitForChange(prev, 10000);
        const cards = await waitForRender(1, 12000);
        if (!cards) {
          report({ phase: "skip", label: kw, index: i + 1, of: keywords.length, total,
                   note: "tidak ada hasil / gagal render" });
          await sleep(delay);
          continue;
        }

        total = await scrapeAndStore("cari: " + kw, cfg);
        done++;
        report({ phase: "scan", label: kw, index: i + 1, of: keywords.length, total,
                 note: `${cards} produk ter-render` });
        await sleep(delay);
      }

      report({ phase: stopRequested ? "stopped" : "done", total,
               note: stopRequested ? "Dihentikan oleh pengguna."
                                   : `Selesai — ${done}/${keywords.length} kata kunci.` });
      return { total, done, stopped: stopRequested };
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
                    findTabByLabel, findNextPage, findSearchInput, waitForRender,
                    currentLabel };
})(typeof window !== "undefined" ? window : this);
