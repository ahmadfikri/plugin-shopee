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

  /* Niche priors (v0.9.26). For each niche in snapshot.niches:
   *   epc   - niche EPC, shrunk toward global with the same K (barely moves:
   *           a niche has thousands of clicks)
   *   tau   - how far ONE product's EPC typically sits from its niche mean:
   *           sqrt(click)-weighted SD of realized EPC over the niche's tags
   *           with >= TAU_MIN_CLICKS clicks.
   *           This, not the SE of the niche mean, is the honest spread for a
   *           product we have never run. Falls back to the global tau when the
   *           niche has < 3 trusted tags.
   *   win*  - P(a new product in this niche pays back): Beta posterior on the
   *           niche's test record (tested / paidBack), with the all-niche rate
   *           as the prior mean and strength WIN_PRIOR_M (partial pooling).  */
  const WIN_PRIOR_M = 4;
  const TAU_MIN_CLICKS = 100;
  function weightedSd(rows) {
    const w = rows.reduce((a, r) => a + r.w, 0);
    if (rows.length < 3 || w <= 0) return null;
    const mu = rows.reduce((a, r) => a + r.w * r.x, 0) / w;
    const v = rows.reduce((a, r) => a + r.w * (r.x - mu) * (r.x - mu), 0) / w;
    return Math.sqrt(v);
  }
  function buildNiches(snapshot, globalEpc, K) {
    const src = snapshot.niches || {};
    const tags = snapshot.tags || {};
    // Only tags with >= TAU_MIN_CLICKS clicks: below that a tag's own EPC is
    // mostly sampling noise (spiceRack: Rp1.470/klik from 58 clicks = one big
    // order), which would inflate the spread and make every new product look
    // like a lottery ticket.
    const rowsOf = (pred) => Object.values(tags)
      .filter((t) => (Number(t.clicks) || 0) >= TAU_MIN_CLICKS && t.epc != null && pred(t))
      .map((t) => ({ x: Number(t.epc), w: Math.sqrt(Number(t.clicks)) }));
    // sqrt(clicks) weights: big tags count more, but one giant tag cannot
    // define the whole spread by itself.
    const tauGlobal = weightedSd(rowsOf(() => true)) || globalEpc / Math.sqrt(K);
    let T = 0, W = 0;
    for (const v of Object.values(src)) { T += Number(v.tested) || 0; W += Number(v.paidBack) || 0; }
    const r0 = T > 0 ? W / T : 0.15;
    const out = {};
    for (const [name, v] of Object.entries(src)) {
      const clicks = Number(v.clicks) || 0;
      if (clicks <= 0 || v.epc == null) continue;
      const tested = Number(v.tested) || 0, won = Number(v.paidBack) || 0;
      const a = r0 * WIN_PRIOR_M + won, b = (1 - r0) * WIN_PRIOR_M + (tested - won);
      const mean = a / (a + b);
      const sd = Math.sqrt(a * b / ((a + b) * (a + b) * (a + b + 1)));
      out[name] = {
        epc: (clicks * Number(v.epc) + K * globalEpc) / (clicks + K),
        tau: weightedSd(rowsOf((t) => t.niche === name)) || tauGlobal,
        clicks, tested, paidBack: won,
        winRate: mean,
        winLow: clamp(mean - 1.28 * sd, 0, 1),
        winHigh: clamp(mean + 1.28 * sd, 0, 1),
        metaCpc: v.metaCpc != null ? Number(v.metaCpc) : null,
        arrival: v.arrival != null ? Number(v.arrival) : null,
        roas: v.roas != null ? Number(v.roas) : null
      };
    }
    return out;
  }

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
      tags: {},
      niches: buildNiches(snapshot, globalEpc, K)
    };

    for (const [tag, t] of Object.entries(tags)) {
      const clicks = Number(t.clicks) || 0;
      const comm = Number(t.commission) || 0;
      // v0.9.26 hierarchical prior: a tag is shrunk toward ITS niche's EPC
      // (itself shrunk toward global), not straight to the global mean.
      const nicheNode = t.niche && model.niches[t.niche];
      const prior = nicheNode ? nicheNode.epc : globalEpc;
      // Prefer the snapshot's own EPC: since 2026-10-19 the export computes it
      // from clean-click days only (commission AND clicks of the same days),
      // while `commission` also covers ANOMALY_DATES for ROAS. Dividing that
      // commission by clean clicks would overstate EPC.
      const realized = (t.epc != null && Number.isFinite(Number(t.epc)) && clicks > 0)
        ? Number(t.epc) : (clicks > 0 ? comm / clicks : prior);
      // posterior mean (shrinkage toward the niche / global prior)
      const shrunk = (clicks * realized + K * prior) / (clicks + K);
      // uncertainty: standard error of a mean shrinks with sqrt(clicks + K).
      // We approximate the EPC spread with the prior EPC as the scale.
      const se = prior / Math.sqrt(clicks + K);
      model.tags[tag] = {
        clicks, orders: Number(t.orders) || 0,
        niche: t.niche || null,
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
    const nicheName = (opts && opts.niche) || null;
    const nicheNode = nicheName && model.niches ? model.niches[nicheName] : null;
    let basis = "global", node = null;
    if (tag && model.tags[tag]) { node = model.tags[tag]; basis = "tag"; }
    else if (nicheNode) basis = "niche";

    let epc, low, high, se, clicks;
    if (node) {
      epc = node.epc; low = node.epc_low; high = node.epc_high;
      se = node.se; clicks = node.clicks;
    } else if (nicheNode) {
      // new product, known family: niche prior, spread = between-product tau
      epc = nicheNode.epc;
      se = nicheNode.tau;
      low = Math.max(0, epc - 1.28 * se);
      high = epc + 1.28 * se;
      clicks = 0;
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
      : nicheNode ? "rendah" : "sangat rendah";

    return {
      epc, epc_low: low, epc_high: high, se,
      basis,                       // 'tag' | 'niche' | 'global'
      tag: node ? tag : null,
      niche: node ? (node.niche || nicheName) : nicheName,
      nicheWin: (() => {
        const nn = model.niches && model.niches[node ? (node.niche || nicheName) : nicheName];
        return nn ? { winRate: nn.winRate, winLow: nn.winLow, winHigh: nn.winHigh,
                      tested: nn.tested, paidBack: nn.paidBack } : null;
      })(),
      clicks,
      kEff: model.K,               // shrinkage strength used by score()
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
  /* Score 0..100 for ranking products.
   *
   * This used to be P(EPC > breakEvenCpc) x 100, which sounds rigorous and is
   * useless in practice: `se` is the standard error of the MEAN, so it shrinks
   * with clicks, and the normal CDF then saturates on the thinnest margin.
   * Measured against the real snapshot (60 tags, 21k clicks): 59% of possible
   * outcomes landed at >=95 or <=5, only 19 distinct values existed, and a tag
   * earning Rp107.5 against a Rp100 click cost — a 7% margin — scored a perfect
   * 100. A column that reads 100 down the page cannot rank anything.
   *
   * The score now reports MARGIN, which is the actual decision: 50 = earnings
   * exactly cover the click, 100 = earnings are twice the click cost, 0 = the
   * click earns nothing. pProfit is kept on the prediction for the drill-down,
   * because "how sure are we" is still worth showing — just not as the ranking.
   */
  function score(pred) {
    const be = pred.breakEvenCpc || 0;
    let s;
    if (be > 0) {
      s = clamp(pred.epc / be, 0, 2) / 2 * 100;
      // Thin evidence must not shout. Shrink toward break-even in proportion to
      // how much this tag was actually observed, so an unseen product sits near
      // neutral instead of inheriting a confident-looking number from the prior.
      const k = pred.kEff > 0 ? pred.kEff : 30;
      const obs = pred.clicks || 0;
      const w = clamp(obs / (obs + k), 0, 1);
      s = Math.round(50 + (s - 50) * (0.35 + 0.65 * w));
    } else {
      // No click cost configured: refuse to invent a ranking.
      s = 50;
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

  /* ROAS of a prediction (v0.9.26, shared by the product page and the
   * Thompson-sampling test plan so both use the same numbers):
   *   value per Meta click = EPC x arrival ;  ROAS = value / Meta CPC
   * arrival and CPC come from the tag (when well observed), else the niche,
   * else global, else the configured target CPC.                            */
  const MIN_TAG_META_CLICKS = 100;   // below this a tag's own CPC is noise
  function num(v) {
    if (v == null || v === "") return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }
  function roasPrior(pred, snapshot, cfg) {
    if (!pred || !snapshot || !snapshot.global) return null;
    const g = snapshot.global;
    const t = pred.basis === "tag" && pred.tag && snapshot.tags ? snapshot.tags[pred.tag] : null;
    const nz = pred.niche && snapshot.niches ? snapshot.niches[pred.niche] : null;
    let arrival = null, arrivalSrc = "global";
    if (t && num(t.arrival) != null) { arrival = num(t.arrival); arrivalSrc = "tag"; }
    else if (nz && num(nz.arrival) != null) { arrival = num(nz.arrival); arrivalSrc = "niche"; }
    else if (num(g.arrival) != null) arrival = num(g.arrival);
    if (arrival == null) { arrival = 1; arrivalSrc = "asumsi 1:1"; }
    let cpc = null, cpcSrc = "";
    if (t && num(t.metaCpc) != null && num(t.metaClicks) >= MIN_TAG_META_CLICKS) {
      cpc = num(t.metaCpc); cpcSrc = "CPC tag ini";
    } else if (nz && num(nz.metaCpc) != null && num(nz.metaClicks) >= MIN_TAG_META_CLICKS) {
      cpc = num(nz.metaCpc); cpcSrc = "CPC rata-rata niche";
    } else if (num(g.metaCpc) != null) {
      cpc = num(g.metaCpc); cpcSrc = "CPC rata-rata kamu";
    } else if (cfg && num(cfg.breakEvenCPC) > 0) {
      cpc = num(cfg.breakEvenCPC); cpcSrc = "target di Admin Panel";
    }
    // v0.9.31 AFTER-TAX economics (Fikri's receipts, 31 Okt 2026): Meta adds
    // PPN on top of "Amount spent" (effective 11%), Shopee withholds WHT at
    // payout (effective 2.5%). So 1x ROAS here = break-even AFTER tax, and
    // maxCpc is the highest Meta CPC (as Ads Manager shows it) that still pays.
    const tx = taxes(cfg);
    const net = 1 - tx.wht, gross = 1 + tx.vat;
    const value = pred.epc * arrival;
    const valueLow = Math.max(0, pred.epc_low * arrival);
    const valueHigh = pred.epc_high * arrival;
    const sd = (pred.se || 0) * arrival;
    const cost = cpc ? cpc * gross : null;
    return {
      arrival, arrivalSrc, cpc, cpcSrc, value, valueLow, valueHigh, valueSd: sd,
      vat: tx.vat, wht: tx.wht, breakEvenGross: gross / net,
      maxCpc: value * net / gross,
      roas: cost ? value * net / cost : null,
      roasLow: cost ? valueLow * net / cost : null,
      roasHigh: cost ? valueHigh * net / cost : null,
      roasSd: cost ? sd * net / cost : null,
      pProfit: (cost && sd > 0) ? normCdf((value * net - cost) / (sd * net)) : null
    };
  }

  // Tax rates from config (Admin Panel), defaults = verified receipts.
  function taxes(cfg) {
    const v = num(cfg && cfg.metaVatPct), w = num(cfg && cfg.shopeeWhtPct);
    return { vat: (v != null && v >= 0 && v < 50 ? v : 11) / 100,
             wht: (w != null && w >= 0 && w < 50 ? w : 2.5) / 100 };
  }
  // Gross (pre-tax) ROAS that is break-even after tax, e.g. 1.11/0.975 = 1.14.
  function breakEvenRoas(cfg) { const t = taxes(cfg); return (1 + t.vat) / (1 - t.wht); }

  global.RMEpc = { build, predict, score, normCdf, roasPrior, taxes, breakEvenRoas, MIN_TAG_META_CLICKS };
})(typeof window !== "undefined" ? window : this);
