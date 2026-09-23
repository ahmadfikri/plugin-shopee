/* perf.js — FEEDBACK LOOP: calibrate scoring with Fikri's REALIZED results.
 *
 * Why this exists (measured 2026-09-13):
 *   The formula Max CPC = harga x komisi% x conversion% OVERSTATED reality ~2.4x.
 *   For KupuA17 the formula said Rp 552/klik; the realized EPC was Rp 228/klik.
 *   Two compounding errors: actual commission per order (Rp 6.371) is far below
 *   harga x komisi% (Rp 13.800), and conversion varies 0%–7% per product.
 *
 *   EPC (rupiah earned per click) is the only number directly comparable to CPC,
 *   so where we have realized EPC we use it as the truth and treat the formula as
 *   a fallback for products we have never run.
 *
 * The snapshot is produced by analisis/export_perf_snapshot.py and imported by the
 * user in the Admin Panel. The plugin NEVER reads affiliate_dashboard.xlsx.
 */
(function (global) {
  "use strict";

  const KEY = "rm_perf";

  function save(snapshot) {
    return new Promise((resolve, reject) => {
      if (!snapshot || !snapshot.tags || !snapshot.global) {
        reject(new Error("Snapshot tidak valid: butuh field 'global' dan 'tags'."));
        return;
      }
      chrome.storage.local.set({ [KEY]: snapshot }, () => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if (err) reject(new Error("Snapshot gagal disimpan: " + err.message));
        else resolve(snapshot);
      });
    });
  }
  function load() {
    return new Promise((r) =>
      chrome.storage.local.get(KEY, (o) => r(o[KEY] || null)));
  }
  function clear() {
    // Read lastError inside the callback. Passing `r` (the resolver) directly as
    // the storage callback leaves chrome.runtime.lastError UNCHECKED, which
    // Chrome surfaces as an "Unchecked runtime.lastError" error in the console
    // (the error Fikri saw). Consuming it here silences the false alarm and lets
    // clear() resolve cleanly whether or not the key existed.
    return new Promise((resolve) =>
      chrome.storage.local.remove(KEY, () => {
        void (chrome.runtime && chrome.runtime.lastError);
        resolve();
      }));
  }

  // Split a tag name like "polkadotIphone" / "caseSwaroskiIphone" into keywords.
  function tagKeywords(tag) {
    return String(tag)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")   // camelCase -> spaced
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3);
  }

  const GENERIC_TAG_WORDS = new Set([
    "case", "casing", "metal", "bling", "iphone", "samsung", "tumbler",
    "produk", "bagus", "murah", "baru"
  ]);

  // Find the best-matching historical tag for a product name.
  // Returns { tag, stats, score } or null. Only TRUSTED tags are matched, so a
  // 2-click tag can never drive a decision.
  function matchTag(productName, snapshot) {
    if (!snapshot || !productName) return null;
    const name = String(productName).toLowerCase();
    const compactName = name.replace(/[^a-z0-9]/g, "");
    let best = null;
    for (const [tag, stats] of Object.entries(snapshot.tags)) {
      if (!stats.trusted) continue;
      const kws = tagKeywords(tag);
      if (!kws.length) continue;
      const hits = kws.filter((k) => name.includes(k));
      const compactTag = String(tag).toLowerCase().replace(/[^a-z0-9]/g, "");
      const genericOnly = kws.every((k) => GENERIC_TAG_WORDS.has(k));
      const exactCompact = compactTag.length >= 5 && compactName.includes(compactTag);
      const enoughSpecific = hits.length >= 2 ||
        (hits.length === 1 && kws.length === 1 && hits[0].length >= 6 && !genericOnly);
      if ((!exactCompact && !enoughSpecific) || (genericOnly && hits.length < 2)) continue;
      const score = hits.length / kws.length + (exactCompact ? 0.5 : 0);
      if (!best || score > best.score) best = { tag, stats, score, hits };
    }
    return best;
  }

  /* Calibration result for one product:
   *   epc          - rupiah per click we can expect (realized where possible)
   *   basis        - 'tag' | 'global' | 'formula'
   *   matchedTag   - which historical tag informed it
   *   zeroConverter- product resembles a tag that got clicks and ZERO orders
   *   note         - human-readable explanation for the UI
   */
  function calibrate(product, cfg, snapshot) {
    // formula fallback (what the plugin used before any real data existed)
    const pct = (product.commissionPct != null && product.commissionPct > 0)
      ? product.commissionPct : cfg.commissionPct;
    const formulaEpc = (product.price != null)
      ? product.price * (pct / 100) * (cfg.conversionRate / 100) : 0;

    if (!snapshot) {
      return { epc: Math.round(formulaEpc), basis: "formula", matchedTag: null,
               zeroConverter: false,
               note: "Belum ada data performa — Max CPC masih pakai rumus asumsi. " +
                     "Impor snapshot di Admin Panel agar akurat." };
    }

    const m = matchTag(product.name, snapshot);
    if (m) {
      const zero = m.stats.verdict === "zero-converter";
      return {
        epc: Math.round(m.stats.epc || 0),
        basis: "tag", matchedTag: m.tag, matchedStats: m.stats,
        zeroConverter: zero,
        note: zero
          ? `Mirip tag '${m.tag}' yang sudah terbukti ${m.stats.clicks} klik / 0 order — JANGAN diiklankan.`
          : `Dikalibrasi dari hasil nyata tag '${m.tag}': EPC Rp ${m.stats.epc}, ROAS ${m.stats.roas}.`
      };
    }

    // no match -> use the account-wide realized EPC, which is still far more
    // honest than the formula (measured 2.4x overstatement).
    const g = snapshot.global || {};
    if (g.epc) {
      return { epc: Math.round(g.epc), basis: "global", matchedTag: null,
               zeroConverter: false,
               note: `Produk baru (belum pernah dijalankan). Pakai EPC rata-rata akun: Rp ${g.epc}/klik.` };
    }
    return { epc: Math.round(formulaEpc), basis: "formula", matchedTag: null,
             zeroConverter: false, note: "Snapshot tidak punya EPC global." };
  }

  // Winner reference list for the UI ("produk mirip winner-mu").
  function winners(snapshot, limit) {
    if (!snapshot) return [];
    return Object.entries(snapshot.tags)
      .filter(([, s]) => s.trusted && (s.verdict === "winner" || s.verdict === "profitable"))
      .sort((a, b) => (b[1].epc || 0) - (a[1].epc || 0))
      .slice(0, limit || 5)
      .map(([tag, s]) => ({ tag, epc: s.epc, roas: s.roas }));
  }

  global.RMPerf = { save, load, clear, calibrate, matchTag, tagKeywords, winners, KEY };
})(typeof window !== "undefined" ? window : this);
