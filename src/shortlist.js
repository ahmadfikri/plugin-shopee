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

  function getAll() {
    return new Promise((r) =>
      chrome.storage.local.get(KEY, (o) => r((o[KEY] || {}).items || [])));
  }
  function getMeta() {
    return new Promise((r) =>
      chrome.storage.local.get(KEY, (o) => r(o[KEY] || { items: [], scans: 0, keywords: [] })));
  }
  function clear() {
    return new Promise((r) => chrome.storage.local.remove(KEY, r));
  }

  // Add a scanned batch. Existing ids are UPDATED (fresher score wins) rather
  // than duplicated, so re-visiting a page does not inflate the list.
  function add(products, keyword) {
    return getMeta().then((meta) => {
      const items = meta.items || [];
      const byId = new Map(items.map((x) => [x.id, x]));
      const now = Date.now();
      let added = 0, updated = 0;

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
          keyword: keyword || "",
          href: p.href || "",
          at: now
        };
        if (byId.has(entry.id)) { byId.set(entry.id, entry); updated++; }
        else { byId.set(entry.id, entry); added++; }
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
      return new Promise((r) =>
        chrome.storage.local.set({ [KEY]: out },
          () => r({ added, updated, total: merged.length, scans: out.scans,
                    keywords: out.keywords })));
    });
  }

  // Ranked view. `limit` null/0 = everything.
  /* Ranking. Sorted by EPC SCORE when a prediction exists, because that is the
   * metric that actually predicts profit (P(untung)); PRO score is the fallback
   * for entries scanned before a snapshot was imported. Zero-converters sink. */
  function ranked(items, limit) {
    const key = (x) => {
      if (x.epcZero) return -1;                       // proven loser: bottom
      if (x.epcScore != null) return 1000 + x.epcScore; // predicted: always above
      return x.pro || 0;                              // no prediction: old PRO score
    };
    const sorted = (items || []).slice().sort((a, b) => key(b) - key(a));
    return (limit && limit > 0) ? sorted.slice(0, limit) : sorted;
  }

  function stats(items) {
    const n = (items || []).length;
    const count = (act) => (items || []).filter((x) => x.action === act).length;
    const best = ranked(items, 1)[0] || null;
    return {
      total: n,
      iklankan: count("IKLANKAN"),
      coba: count("LAYAK COBA"),
      skip: count("SKIP") + count("LEMAH"),
      best
    };
  }

  function toCsv(items) {
    const head = ["epcScore", "epcAction", "epc", "epcLow", "epcHigh",
                  "epcConfidence", "epcBasis", "epcTag", "epcZero",
                  "pro", "action", "name", "price", "commissionPct", "maxCPC",
                  "basis", "keyword", "href"];
    const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const rows = ranked(items, 0).map((x) => head.map((k) => esc(x[k])).join(","));
    return head.join(",") + "\n" + rows.join("\n");
  }

  global.RMShortlist = { KEY, add, getAll, getMeta, clear, ranked, stats, toCsv };
})(typeof window !== "undefined" ? window : this);
