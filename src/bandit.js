/* bandit.js — THOMPSON SAMPLING test plan for the shortlist (v0.9.26).
 *
 * Question it answers: "of the products I scanned, which few should get the
 * next Rp30rb test budget?" Sorting by predicted ROAS alone always re-picks the
 * products we are already sure about and never tries an uncertain one that
 * might be better. Thompson sampling (the method behind google-research
 * offline_online_bandits: online tests warm-started from offline history)
 * fixes that in the simplest honest way:
 *
 *   for each of D draws:
 *     sample every candidate's ROAS from its posterior  N(roas, roasSd), >= 0
 *     the k highest samples "get picked" in this draw
 *   P(dipilih)  = share of draws in which a product was picked
 *   recommended = the k products with the highest P(dipilih)
 *
 * roas / roasSd come from RMEpc.predict + RMEpc.roasPrior, i.e. the same Empirical
 * Bayes posterior (tag -> niche -> global) the product page shows. A product
 * with little evidence has a wide posterior, so it wins some draws even when its
 * mean is lower; a proven product has a narrow one and wins on its mean.
 *
 * Honest limit, shown in the UI: products with no tag history in the same niche
 * share ONE prior, so their posteriors are identical and the order among them is
 * a coin flip. Nothing in the data can separate them before they are tested.
 *
 * Deterministic: the PRNG is seeded from the candidate ids, so the plan does not
 * reshuffle every time the panel re-renders. Pure functions, no DOM, no storage.
 */
(function (global) {
  "use strict";

  const DRAWS = 2000;
  // Bound the cost: the panel re-plans on every bulk-scan page. Below the top
  // 100 by mean, a product's chance of landing in the top 3 is negligible.
  const MAX_CANDIDATES = 100;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  // Box-Muller standard normal from a uniform PRNG
  function gauss(rnd) {
    let u = 0;
    while (u <= 1e-12) u = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  }
  function normCdf(z) {
    if (global.RMEpc && global.RMEpc.normCdf) return global.RMEpc.normCdf(z);
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }
  function finite(x) { return typeof x === "number" && Number.isFinite(x); }

  /* plan(items, { k, draws, seed }) ->
   *   { picks: [row...k], rows: [row...], eligible, skipped, k, ties }
   *   row = { item, roas, roasSd, pPick, pBest, pAbove1 }                    */
  function plan(items, opts) {
    const o = opts || {};
    const all = (items || []).filter(Boolean);
    let cands = all.filter((x) => !x.epcZero && finite(x.roas) && finite(x.roasSd) && x.roasSd >= 0);
    const skipped = all.length - cands.length;
    cands = cands.slice().sort((a, b) => b.roas - a.roas).slice(0, MAX_CANDIDATES);
    const n = cands.length;
    const k = Math.max(0, Math.min(Number(o.k) || 3, n));
    if (!n || !k) return { picks: [], rows: [], eligible: n, skipped, k: 0, ties: 0 };

    const D = Math.max(100, Math.min(Number(o.draws) || DRAWS, 20000));
    const seed = o.seed != null ? (o.seed >>> 0)
      : hashStr(cands.map((x) => String(x.id || x.name || "")).sort().join("|"));
    // memo: the panel re-renders on every bulk-scan page; same input -> same plan
    const memoKey = all.length + ":" + seed + ":" + D + ":" + k + ":" + cands.map((x) => x.roas + "/" + x.roasSd).join(",");
    if (memo.key === memoKey) return memo.val;
    const rnd = mulberry32(seed);
    const pick = new Array(n).fill(0), best = new Array(n).fill(0);
    const s = new Array(n), top = new Array(k);
    for (let d = 0; d < D; d++) {
      for (let i = 0; i < n; i++) s[i] = Math.max(0, cands[i].roas + cands[i].roasSd * gauss(rnd));
      // top-k by selection (k is tiny), O(n*k) instead of a full sort
      let m = 0;
      for (let i = 0; i < n; i++) {
        if (m < k) { top[m++] = i; } else if (s[i] > s[top[m - 1]]) { top[m - 1] = i; } else continue;
        for (let j = m - 1; j > 0 && s[top[j]] > s[top[j - 1]]; j--) {
          const t = top[j]; top[j] = top[j - 1]; top[j - 1] = t;
        }
      }
      best[top[0]]++;
      for (let j = 0; j < k; j++) pick[top[j]]++;
    }
    const rows = cands.map((x, i) => ({
      item: x, roas: x.roas, roasSd: x.roasSd,
      pPick: pick[i] / D, pBest: best[i] / D,
      pAbove1: x.roasSd > 0 ? normCdf((x.roas - 1) / x.roasSd) : (x.roas >= 1 ? 1 : 0)
    })).sort((a, b) => b.pPick - a.pPick || b.roas - a.roas);
    const picks = rows.slice(0, k);
    // how many picks share an identical posterior with a product that was NOT
    // picked -> the choice among those is a coin flip, say so in the UI
    const key = (r) => r.roas.toFixed(4) + "/" + r.roasSd.toFixed(4);
    const unpicked = new Set(rows.slice(k).map(key));
    const ties = picks.filter((r) => unpicked.has(key(r))).length;
    const val = { picks, rows, eligible: n, skipped, k, ties, draws: D };
    memo.key = memoKey; memo.val = val;
    return val;
  }
  const memo = { key: null, val: null };

  global.RMBandit = { plan, mulberry32, DRAWS };
})(typeof window !== "undefined" ? window : this);
