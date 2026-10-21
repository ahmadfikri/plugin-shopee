/* analytics.js — turn scraped products into market stats + the differentiator
 * scores (Layak Iklan, Saturasi, Momentum). Pure functions, no side effects. */
(function (global) {
  "use strict";

  // Estimate monthly units. Shopee search cards usually give a total-sold figure,
  // not per-month; when listing age is unknown we fall back to a conservative
  // fraction. This is an ESTIMATE — flagged as such in the UI.
  function unitsPerMonth(p) {
    if (p.soldPerMonth != null) return p.soldPerMonth;
    if (p.soldTotal == null) return null;
    if (p.ageMonths && p.ageMonths > 0) return Math.round(p.soldTotal / p.ageMonths);
    // no age: assume the shown total is a recent/rolling number, discount it
    return Math.round(p.soldTotal * 0.15);
  }

  function revenuePerMonth(p) {
    const u = unitsPerMonth(p);
    return u != null && p.price != null ? u * p.price : null;
  }

  // Layak Iklan: can this product plausibly be profitable under paid ads?
  // value/click = price * commission% * conversion% ; compare to break-even CPC.
  function layakIklan(p, cfg) {
    if (p.price == null) return { verdict: "?", valuePerClick: null };
    // Prefer the REAL commission % from the affiliate page; fall back to config.
    const pct = (p.commissionPct != null && p.commissionPct > 0)
      ? p.commissionPct : cfg.commissionPct;
    const commission = p.price * (pct / 100);
    const valuePerClick = commission * (cfg.conversionRate / 100);
    let verdict;
    if (valuePerClick >= cfg.breakEvenCPC) verdict = "LAYAK";
    else if (valuePerClick >= cfg.breakEvenCPC * 0.6) verdict = "HATI-HATI";
    else verdict = "SUSAH";
    return { verdict, valuePerClick: Math.round(valuePerClick),
             commissionPct: pct,
             commissionPerOrder: Math.round(commission) };
  }

  function momentum(p, cfg) {
    const u = unitsPerMonth(p);
    return (p.ageMonths != null && p.ageMonths <= cfg.momentumMaxAgeMonths &&
            u != null && u >= cfg.momentumMinPerMonth);
  }

  function analyze(snapshot, cfg) {
    const P = snapshot.products;
    const marketSize = P.reduce((s, p) => s + (revenuePerMonth(p) || 0), 0);

    const products = P.map((p) => ({
      ...p,
      unitsPerMonth: unitsPerMonth(p),
      revenuePerMonth: revenuePerMonth(p),
      layak: layakIklan(p, cfg),
      momentum: momentum(p, cfg)
    }));

    // ---- PRO SCORE per product (professional selection engine) ----
    // `cfg.__perf` is the imported performance snapshot (set by content.js), used
    // to calibrate Max CPC from REALIZED EPC instead of the assumption formula.
    const marketCtx = { marketSize };
    if (global.RMProScore) {
      const snap = cfg && cfg.__perf ? cfg.__perf : null;
      // Build the Empirical Bayes EPC model ONCE per page, then predict per
      // product. Attaching it here (not only in MODE A) is what makes the EPC
      // score available in the listing table, the drill-down modal AND the
      // cumulative shortlist.
      const epcModel = (snap && global.RMEpc) ? global.RMEpc.build(snap) : null;
      const breakEven = (cfg && cfg.breakEvenCPC) || 0;
      for (const p of products) {
        p.revenuePerMonth = p.revenuePerMonth || 0;
        const calib = (snap && global.RMPerf)
          ? global.RMPerf.calibrate(p, cfg, snap) : null;
        p.calib = calib;
        p.pro = global.RMProScore.scoreProduct(p, cfg, marketCtx, calib);
        if (epcModel) {
          // matchTag returns an OBJECT {tag, stats, score, hits} — take .tag,
          // because RMEpc.predict looks the tag up by NAME. Passing the object
          // silently fell through to the global prior, making every product score
          // identically (the "no new scoring" bug).
          const m = (global.RMPerf && global.RMPerf.matchTag)
            ? global.RMPerf.matchTag(p.name, snap) : null;
          const tag = m && m.tag ? m.tag : null;
          // breakEven here is deliberately the CONFIGURED cost per click, not the
          // product's maxProfitableCPC. maxProfitableCPC is a ceiling on earnings
          // (commission x conversion), so scoring EPC against it would compare
          // earnings with earnings and land every product near neutral. The
          // decision is earnings per click versus what a click actually costs.
          const nc = global.RMNiche ? global.RMNiche.classify({ name: p.name }) : null;
          const niche = nc ? nc.niche : null;
          const pred = global.RMEpc.predict(epcModel, { tag, niche, breakEvenCpc: breakEven });
          const sc = global.RMEpc.score(pred);
          pred.score = sc.score;
          pred.action = sc.action;
          pred.matchedTag = tag;
          // v0.9.26: ROAS posterior (tag -> niche -> global arrival/CPC) for the
          // Thompson test plan. null-safe: older snapshots without Meta fields
          // simply leave roas null and the product is skipped by the plan.
          const ec = global.RMEpc.roasPrior ? global.RMEpc.roasPrior(pred, snap, cfg) : null;
          pred.roas = ec ? ec.roas : null;
          pred.roasSd = ec ? ec.roasSd : null;
          p.epcPred = pred;
          // v0.9.27: the SAME decision engine as the product page, so the
          // listing, the shortlist and the product page can never disagree.
          p.suggestedTag = tag;
          p.niche = niche;
          p.nicheSource = nc ? nc.source : null;
          p.decision = null;
          if (global.RMProductPage && global.RMProductPage.decide) {
            try {
              const d = global.RMProductPage.decide(pred, snap, tag, cfg);
              p.decision = d && d.ready ? {
                action: d.action, cls: d.cls, basis: d.basis, niche: d.niche,
                roas: d.roas, roasLow: d.roasLow, roasHigh: d.roasHigh,
                maxCpc: d.maxCpc, cpc: d.cpc, cpcSrc: d.cpcSrc, pProfit: d.pProfit,
                reason: (d.reasons || [])[0] || ""
              } : null;
            } catch (_) { p.decision = null; }   // never let one product break the page
          }
        } else {
          p.epcPred = null;
          p.decision = null;
        }
      }
    }

    return {
      keyword: snapshot.keyword,
      scrapedAt: snapshot.scrapedAt,
      productCount: P.length,
      marketSize: Math.round(marketSize),
      products
    };
  }

  global.RMAnalytics = { analyze, unitsPerMonth, revenuePerMonth, layakIklan, momentum };
})(typeof window !== "undefined" ? window : this);
