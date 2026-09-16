/* epc.js — EPC PREDICTION via Empirical Bayes shrinkage.
 *
 * PROBLEM with the old PRO score: it was a hand-weighted sum (35/30/25/10) that
 * predicted nothing. This module answers the real question: "if I advertise this,
 * how much am I likely to earn per click, and what's the chance it beats my cost
 * per click?" — as a NUMBER with a confidence range, learned from Fikri's own data.
 *
 * WHY Empirical Bayes (not ML): the dataset is ~28-33 labelled tags. That is far
 * too small for gradient boosting / neural nets (they'd overfit and lie). Empirical
 * Bayes is the correct tool for "estimate a rate when some items have lots of data
 * and some have little" — it is exactly what industry uses for this shape.
 *
 * THE LOGIC (documented in full in _docs/epc-prediction.md):
 *   realized_epc[tag]     = commission[tag] / clicks[tag]     (observed, noisy for few clicks)
 *   global_epc            = total_commission / total_clicks   (the prior mean)
 *   shrunk_epc[tag]       = (clicks * realized + K * global) / (clicks + K)
 *
 *   K = "shrinkage strength" = how many clicks of evidence it takes before we
 *       trust a tag's own number over the global mean. We set K to the median
 *       clicks-per-tag, so a tag with typical volume is weighted ~50/50 against
 *       the prior; a tag with 10x the clicks is trusted almost fully; a tag with
 *       a handful of clicks is pulled hard toward global. This is the Beta-Binomial
 *       / Normal-Normal posterior mean, simplified for a rate.
 *
 * Everything is pure arithmetic on the imported performance snapshot — no fetch,
 * no libraries, runs in the content script.
 */
(function (global) {
  "use strict";

  // Percentile helper for confidence band.
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  /* Build the model from a performance snapshot (the object RMPerf.load()
   * returns — { global:{clicks,orders,commission,epc}, tags:{tag:{clicks,orders,commission,epc,roas,trusted}} }).
   * Returns a model object with per-tag posterior EPC + uncertainty. */
  function build(snapshot) {
    if (!snapshot || !snapshot.global) return null;
    const g = snapshot.global;
    const globalEpc = g.epc != null ? g.epc
      : (g.clicks > 0 ? g.commission / g.clicks : 0);
    const globalConv = (g.clicks > 0) ? g.orders / g.clicks : 0;

    const tags = snapshot.tags || {};
    const clickCounts = Object.values(tags)
      .map((t) => Number(t.clicks) || 0).filter((c) => c > 0).sort((a, b) => a - b);
    // K = median clicks-per-tag (shrinkage strength). Fallback 30.
    let K = 30;
    if (clickCounts.length) {
      const mid = Math.floor(clickCounts.length / 2);
      K = clickCounts.length % 2 ? clickCounts[mid]
        : (clickCounts[mid - 1] + clickCounts[mid]) / 2;
      K = clamp(K, 10, 200);
    }

    const model = {
      globalEpc, globalConv, K,
      builtAt: new Date().toISOString(),
      tagCount: Object.keys(tags).length,
      tags: {}
    };

    for (const [tag, t] of Object.entries(tags)) {
      const clicks = Number(t.clicks) || 0;
      const comm = Number(t.commission) || 0;
      const realized = clicks > 0 ? comm / clicks : globalEpc;
      // posterior mean (shrinkage toward global prior)
      const shrunk = (clicks * realized + K * globalEpc) / (clicks + K);
      // uncertainty: standard error of a mean shrinks with sqrt(clicks + K).
      // We approximate the EPC spread with global EPC as the scale.
      const se = globalEpc / Math.sqrt(clicks + K);
      model.tags[tag] = {
        clicks, orders: Number(t.orders) || 0,
        realized_epc: realized,
        epc: shrunk,                 // <- the prediction
        epc_low: Math.max(0, shrunk - 1.28 * se),   // ~80% band
        epc_high: shrunk + 1.28 * se,
        se,
        n_effective: clicks + K,
        zero_converter: clicks >= 25 && (Number(t.orders) || 0) === 0
      };
    }
    return model;
  }

  /* Predict EPC for a product. Strategy:
   *   1. If we have a trusted tag match (via RMPerf keyword match) -> use its posterior.
   *   2. Else -> fall back to the global prior EPC with wide uncertainty.
   * breakEvenCpc = the CPC above which you lose money; used for P(profit).
   */
  function predict(model, opts) {
    const breakEven = (opts && opts.breakEvenCpc) || 0;
    const tag = opts && opts.tag;
    let basis = "global", node = null;
    if (tag && model.tags[tag]) { node = model.tags[tag]; basis = "tag"; }

    let epc, low, high, se, clicks;
    if (node) {
      epc = node.epc; low = node.epc_low; high = node.epc_high;
      se = node.se; clicks = node.clicks;
    } else {
      // new product, no history: prior mean, wide band (K effective observations)
      epc = model.globalEpc;
      se = model.globalEpc / Math.sqrt(model.K);
      low = Math.max(0, epc - 1.28 * se);
      high = epc + 1.28 * se;
      clicks = 0;
    }

    // P(EPC > breakEvenCpc): probability this earns more per click than it costs.
    // Normal approximation with mean=epc, sd=se.
    let pProfit = null;
    if (breakEven > 0 && se > 0) {
      const z = (epc - breakEven) / se;
      pProfit = normCdf(z);
    }

    // confidence label from effective evidence
    const conf = node
      ? (clicks >= 3 * model.K ? "tinggi" : clicks >= model.K ? "sedang" : "rendah")
      : "sangat rendah";

    return {
      epc, epc_low: low, epc_high: high, se,
      basis,                       // 'tag' | 'global'
      clicks,
      confidence: conf,
      breakEvenCpc: breakEven,
      pProfit,                     // 0..1 or null
      zeroConverter: !!(node && node.zero_converter)
    };
  }

  // Standard normal CDF (Abramowitz-Stegun approximation).
  function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t *
      (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  // Map a prediction to a 0-100 EPC SCORE for display beside the PRO score.
  // NOT another arbitrary weighting: it is a monotone transform of P(profit)
  // (when breakeven known) or of EPC vs global (when not), so the score is a
  // faithful ranking of expected profitability, with a readable action band.
  function score(pred) {
    let s;
    if (pred.pProfit != null) {
      s = Math.round(pred.pProfit * 100);        // score = probability of profit
    } else {
      // no breakeven: rank by EPC relative to 2x global (100 = twice the average earner)
      s = Math.round(clamp(pred.epc / (2 * (pred.epc_global || pred.epc || 1)), 0, 1) * 100);
    }
    if (pred.zeroConverter) s = Math.min(s, 15);   // proven loser cap
    let action;
    if (pred.zeroConverter) action = "SKIP — terbukti 0 order";
    else if (s >= 65) action = "IKLANKAN";
    else if (s >= 50) action = "LAYAK COBA";
    else if (s >= 35) action = "HATI-HATI";
    else action = "LEMAH";
    return { score: s, action };
  }

  global.RMEpc = { build, predict, score, normCdf };
})(typeof window !== "undefined" ? window : this);
