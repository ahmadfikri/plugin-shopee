/* shortlist.js — BULK SCAN accumulator.
 *
 * Every page/category Fikri opens adds its products into one cumulative,
 * de-duplicated shortlist in chrome.storage. That turns "riset 20 produk per
 * halaman" into "riset ratusan produk lintas kategori", ranked in one place.
 *
 * Stored per product (only what a decision needs — kept small on purpose):
 *   id, name, price, commissionPct, pro, action, maxCPC, basis, keyword, href, at
 */
(function (global) {
  "use strict";

  const KEY = "rm_shortlist";
  const MAX_ENTRIES = 2000;    // hard cap so storage can't grow forever

  let mutationQueue = Promise.resolve();
  function serialized(task) {
    const run = mutationQueue.then(task, task);
    mutationQueue = run.catch(() => {});
    return run;
  }

  function getAll() {
    return new Promise((r) =>
      chrome.storage.local.get(KEY, (o) => r((o[KEY] || {}).items || [])));
  }
  function getMeta() {
    return new Promise((r) =>
      chrome.storage.local.get(KEY, (o) => r(o[KEY] || { items: [], scans: 0, keywords: [] })));
  }
  function clear() {
    // Read lastError inside the callback — passing the resolver `r` directly as
    // the storage callback leaves chrome.runtime.lastError UNCHECKED, which
    // Chrome logs as "Unchecked runtime.lastError". Consume it so a Kosongkan
    // never throws into the console.
    return new Promise((resolve) =>
      chrome.storage.local.remove(KEY, () => {
        void (chrome.runtime && chrome.runtime.lastError);
        resolve();
      }));
  }

  // Add a scanned batch. Existing ids are UPDATED (fresher score wins) rather
  // than duplicated, so re-visiting a page does not inflate the list.
  function addUnsafe(products, keyword, opts) {
    const runId = (opts && opts.run) || null;
    return getMeta().then((meta) => {
      const items = meta.items || [];
      const byId = new Map(items.map((x) => [x.id, x]));
      const now = Date.now();
      let added = 0, updated = 0;
      const addedIds = [], seenIds = [];

      for (const p of products) {
        if (!p || !p.pro) continue;
        const ec = p.pro.economics || {};
        const ep = p.epcPred || null;      // Empirical Bayes prediction (analytics.js)
        const entry = {
          id: String(p.id),
          name: p.name || "",
          price: p.price != null ? p.price : null,
          commissionPct: ec.commissionPct != null ? ec.commissionPct : null,
          pro: p.pro.pro,
          action: p.pro.action,
          maxCPC: ec.maxProfitableCPC != null ? ec.maxProfitableCPC : null,
          basis: ec.basis || "formula",
          rating: p.rating != null ? p.rating : null,
          unitsPerMonth: p.unitsPerMonth != null ? p.unitsPerMonth : null,
          gated: !!(p.pro.gates && p.pro.gates.length),
          // ---- EPC prediction (null when no snapshot imported) ----
          epcScore: ep ? ep.score : null,
          epcAction: ep ? ep.action : null,
          epc: ep ? Math.round(ep.epc) : null,
          epcLow: ep ? Math.round(ep.epc_low) : null,
          epcHigh: ep ? Math.round(ep.epc_high) : null,
          epcConfidence: ep ? ep.confidence : null,
          epcBasis: ep ? ep.basis : null,
          epcTag: ep ? (ep.matchedTag || null) : null,
          epcZero: ep ? !!ep.zeroConverter : false,
          // ---- v0.9.26: niche + ROAS posterior for the Thompson test plan ----
          niche: ep && ep.niche ? ep.niche : null,
          roas: ep && Number.isFinite(ep.roas) ? Math.round(ep.roas * 1000) / 1000 : null,
          roasSd: ep && Number.isFinite(ep.roasSd) ? Math.round(ep.roasSd * 1000) / 1000 : null,
          // ---- v0.9.27: verdict from the shared decision engine ----
          verdict: p.decision ? p.decision.action : null,
          verdictCls: p.decision ? p.decision.cls : null,
          roasLow: p.decision && Number.isFinite(p.decision.roasLow) ? Math.round(p.decision.roasLow * 100) / 100 : null,
          roasHigh: p.decision && Number.isFinite(p.decision.roasHigh) ? Math.round(p.decision.roasHigh * 100) / 100 : null,
          maxCpcMeta: p.decision && Number.isFinite(p.decision.maxCpc) ? Math.round(p.decision.maxCpc) : null,
          cpcMeta: p.decision && Number.isFinite(p.decision.cpc) ? Math.round(p.decision.cpc) : null,
          keyword: keyword || "",
          href: p.href || "",
          at: now,
          firstAt: now,       // first time this product ever entered the list
          run: runId          // bulk-scan run that last touched it (null = observer)
        };
        if (byId.has(entry.id)) {
          const old = byId.get(entry.id);
          // After bulk finishes, the normal observer may re-save the same page
          // using a generic pathname. Preserve the explicit `cari:` label so the
          // latest-keyword lower-table filter does not disappear seconds later.
          if (/^cari:\s*/i.test(old.keyword || "") &&
              !/^cari:\s*/i.test(entry.keyword || "")) {
            entry.keyword = old.keyword;
          }
          entry.firstAt = old.firstAt || old.at || now;
          // The page observer re-saves the visible page right after a bulk run
          // ends; it must not strip the run tag, or the "hasil scan terakhir"
          // view loses exactly the products that are on screen.
          if (!runId && old.run) entry.run = old.run;
          byId.set(entry.id, entry); updated++; seenIds.push(entry.id);
        }
        else { byId.set(entry.id, entry); added++; addedIds.push(entry.id); seenIds.push(entry.id); }
      }

      let merged = Array.from(byId.values());
      // keep the highest-scoring entries if we ever exceed the cap
      if (merged.length > MAX_ENTRIES) {
        merged.sort((a, b) => (b.pro || 0) - (a.pro || 0));
        merged = merged.slice(0, MAX_ENTRIES);
      }

      const keywords = Array.from(new Set(
        (meta.keywords || []).concat(keyword ? [keyword] : [])));
      const out = {
        items: merged,
        scans: (meta.scans || 0) + 1,
        keywords: keywords.slice(-50),
        updatedAt: now
      };
      return new Promise((r, reject) =>
        chrome.storage.local.set({ [KEY]: out }, () => {
          const err = chrome.runtime && chrome.runtime.lastError;
          if (err) reject(new Error("Shortlist gagal disimpan: " + err.message));
          else r({ added, updated, addedIds, seenIds, total: merged.length, scans: out.scans,
                   keywords: out.keywords });
        }));
    });
  }

  function add(products, keyword, opts) {
    return serialized(() => addUnsafe(products, keyword, opts));
  }

  // One filter rule for the table AND the activity log. "__run:<id>" = every
  // product touched by that bulk-scan run; anything else = exact keyword label.
  const RUN_PREFIX = "__run:";
  function filterItems(items, filter) {
    items = items || [];
    if (!filter) return items;
    const f = String(filter);
    if (f.indexOf(RUN_PREFIX) === 0) {
      const id = f.slice(RUN_PREFIX.length);
      return items.filter((x) => x && x.run === id);
    }
    return items.filter((x) => String(x.keyword || "") === f);
  }
  function isRunFilter(filter) { return !!filter && String(filter).indexOf(RUN_PREFIX) === 0; }

  // Ranked view. `limit` null/0 = everything.
  /* Ranking. Sorted by EPC SCORE when a prediction exists, because that is the
   * metric that actually predicts profit (P(untung)); PRO score is the fallback
   * for entries scanned before a snapshot was imported. Zero-converters sink. */
  function ranked(items, limit) {
    // v0.9.27: predicted ROAS (shared decision engine) ranks first; entries
    // scanned before v0.9.27 fall back to the EPC score, then the PRO score.
    const key = (x) => {
      if (x.epcZero) return -1;                       // proven loser: bottom
      if (typeof x.roas === "number" && Number.isFinite(x.roas) && x.verdict) return 2000 + x.roas * 100;
      if (x.epcScore != null) return 1000 + x.epcScore; // predicted: always above
      return x.pro || 0;                              // no prediction: old PRO score
    };
    const sorted = (items || []).slice().sort((a, b) => key(b) - key(a));
    return (limit && limit > 0) ? sorted.slice(0, limit) : sorted;
  }

  // Verdict buckets. New entries use the decision-engine verdict; older ones map
  // their PRO action so the counts stay meaningful during the transition.
  const BUCKET = {
    "IKLANKAN": "iklankan", "LAYAK COBA": "coba", "UJI KECIL": "uji",
    "HATI-HATI": "hati", "LEWATI": "skip",
    "SKIP": "skip", "LEMAH": "skip"
  };
  function stats(items) {
    const n = (items || []).length;
    const c = { iklankan: 0, coba: 0, uji: 0, hati: 0, skip: 0 };
    for (const x of items || []) {
      const b = BUCKET[x.verdict || x.action];
      if (b) c[b]++;
    }
    const best = ranked(items, 1)[0] || null;
    return Object.assign({ total: n, best }, c);
  }

  function toCsv(items) {
    const head = ["epcScore", "epcAction", "epc", "epcLow", "epcHigh",
                  "epcConfidence", "epcBasis", "epcTag", "epcZero", "niche", "roas", "roasSd",
                  "verdict", "roasLow", "roasHigh", "maxCpcMeta", "cpcMeta",
                  "pro", "action", "name", "price", "commissionPct", "maxCPC",
                  "basis", "rating", "unitsPerMonth", "keyword", "href"];
    const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const rows = ranked(items, 0).map((x) => head.map((k) => esc(x[k])).join(","));
    return head.join(",") + "\n" + rows.join("\n");
  }

  global.RMShortlist = { KEY, add, getAll, getMeta, clear, ranked, stats, toCsv,
                         filterItems, isRunFilter, RUN_PREFIX };
})(typeof window !== "undefined" ? window : this);
