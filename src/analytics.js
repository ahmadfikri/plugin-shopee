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

  function bucketize(products, keyFn, edges) {
    const out = edges.slice(0, -1).map((lo, i) => ({
      lo, hi: edges[i + 1], units: 0, revenue: 0, count: 0, names: []
    }));
    for (const p of products) {
      const v = keyFn(p);
      if (v == null) continue;
      for (const b of out) {
        if (v >= b.lo && v < b.hi) {
          b.units += unitsPerMonth(p) || 0;
          b.revenue += revenuePerMonth(p) || 0;
          b.count += 1;
          if (p.name) b.names.push(p.name);
          break;
        }
      }
    }
    // keep only top few names (by original order) for tooltip brevity
    out.forEach((b) => { b.names = b.names.slice(0, 6); });
    return out;
  }

  function analyze(snapshot, cfg) {
    const P = snapshot.products;
    const prices = P.map((p) => p.price).filter((x) => x != null);
    const marketSize = P.reduce((s, p) => s + (revenuePerMonth(p) || 0), 0);

    // saturation: share of total monthly revenue held by the top-3 shops
    const byShop = {};
    for (const p of P) {
      const rev = revenuePerMonth(p) || 0;
      const k = p.shop || "?";
      byShop[k] = (byShop[k] || 0) + rev;
    }
    const shopRev = Object.values(byShop).sort((a, b) => b - a);
    const top3 = shopRev.slice(0, 3).reduce((a, b) => a + b, 0);
    const top3Pct = marketSize > 0 ? (top3 / marketSize) * 100 : 0;
    const saturation = top3Pct >= cfg.saturationTop3Pct ? "JENUH" : "ADA RUANG";

    // price sweet-spot: bucket edges spanning min..max in ~7 steps
    const minP = Math.min(...prices, 0), maxP = Math.max(...prices, 1);
    const step = Math.max(1, Math.round((maxP - minP) / 7));
    const edges = []; for (let v = minP; v <= maxP + step; v += step) edges.push(v);
    const priceBuckets = bucketize(P, (p) => p.price, edges);
    const sweet = priceBuckets.slice().sort((a, b) => b.revenue - a.revenue)[0] || null;

    const medianPrice = prices.length
      ? prices.slice().sort((a, b) => a - b)[Math.floor(prices.length / 2)] : null;

    const products = P.map((p) => ({
      ...p,
      unitsPerMonth: unitsPerMonth(p),
      revenuePerMonth: revenuePerMonth(p),
      layak: layakIklan(p, cfg),
      momentum: momentum(p, cfg),
      priceVsMedian: (medianPrice && p.price != null)
        ? (p.price >= medianPrice ? "di atas" : "di bawah") : null
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
          const pred = global.RMEpc.predict(epcModel, { tag, breakEvenCpc: breakEven });
          const sc = global.RMEpc.score(pred);
          pred.score = sc.score;
          pred.action = sc.action;
          pred.matchedTag = tag;
          p.epcPred = pred;
        } else {
          p.epcPred = null;
        }
      }
    }

    // ---- ADVANCED ANALYTICS ----
    const adv = advanced(products, {
      marketSize, top3Pct, saturation, sweet, medianPrice, cfg
    });

    return {
      keyword: snapshot.keyword,
      scrapedAt: snapshot.scrapedAt,
      productCount: P.length,
      marketSize: Math.round(marketSize),
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMax: prices.length ? Math.max(...prices) : null,
      medianPrice,
      saturation, top3Pct: Math.round(top3Pct),
      priceBuckets, sweetSpot: sweet,
      products,
      // advanced block
      opportunityScore: adv.opportunityScore,
      scoreBreakdown: adv.breakdown,
      quadrant: adv.quadrant,
      profitPerMonth: adv.profitPerMonth,
      entryPrice: adv.entryPrice,
      ageDist: adv.ageDist,
      verdict: adv.verdict
    };
  }

  // ---- advanced decision metrics ----
  function advanced(products, ctx) {
    const { marketSize, top3Pct, saturation, sweet, medianPrice, cfg } = ctx;

    // 1. Estimated PROFIT/month = market revenue x commission% (what an affiliate
    //    could plausibly touch), NOT the sellers' gross.
    const profitPerMonth = Math.round(marketSize * (cfg.commissionPct / 100));

    // 2. Sub-scores (0..1), each with a clear meaning.
    // Demand: log-scaled market size, saturates ~Rp5B.
    const demand = Math.min(1, Math.log10(Math.max(1, marketSize)) / Math.log10(5e9));
    // Openness: inverse of top-3 concentration.
    const openness = Math.max(0, 1 - top3Pct / 100);
    // Ad-viability: fraction of products that pass "LAYAK".
    const layakN = products.filter((p) => p.layak.verdict === "LAYAK").length;
    const adViability = products.length ? layakN / products.length : 0;
    // Momentum presence: any fresh-but-selling listings?
    const momoN = products.filter((p) => p.momentum).length;
    const momentumScore = products.length ? Math.min(1, momoN / Math.max(3, products.length * 0.2)) : 0;

    // 3. Opportunity Score 0..100 (weighted). Weights favour openness + ad-viability
    //    because Fikri's losses came from saturated / un-profitable-at-ads markets.
    const breakdown = {
      demand: Math.round(demand * 100),
      openness: Math.round(openness * 100),
      adViability: Math.round(adViability * 100),
      momentum: Math.round(momentumScore * 100)
    };
    const opportunityScore = Math.round(
      demand * 25 + openness * 30 + adViability * 30 + momentumScore * 15);

    // 4. Demand vs Competition quadrant.
    const hiDemand = demand >= 0.5, hiComp = top3Pct >= cfg.saturationTop3Pct;
    const quadrant =
      hiDemand && !hiComp ? "🟢 SWEET ZONE (pasar besar, belum jenuh)" :
      hiDemand && hiComp ? "🟡 RAMAI TAPI JENUH (butuh diferensiasi)" :
      !hiDemand && !hiComp ? "🔵 NICHE (kecil tapi terbuka)" :
      "🔴 HINDARI (kecil & jenuh)";

    // 5. Recommended entry price = midpoint of the revenue sweet-spot bucket,
    //    nudged toward the median so you compete where money actually is.
    let entryPrice = null;
    if (sweet) {
      const mid = Math.round((sweet.lo + sweet.hi) / 2);
      entryPrice = medianPrice ? Math.round((mid + medianPrice) / 2) : mid;
    }

    // 6. Age distribution -> is this a mature or emerging market?
    const ageDist = { emerging: 0, growing: 0, mature: 0, unknown: 0 };
    for (const p of products) {
      if (p.ageMonths == null) ageDist.unknown++;
      else if (p.ageMonths <= 3) ageDist.emerging++;
      else if (p.ageMonths <= 12) ageDist.growing++;
      else ageDist.mature++;
    }

    // 7. Plain-language verdict.
    let verdict;
    if (opportunityScore >= 70) verdict = "MASUK — peluang kuat";
    else if (opportunityScore >= 50) verdict = "PERTIMBANGKAN — ada peluang tapi hati-hati";
    else if (opportunityScore >= 30) verdict = "RISIKO TINGGI — hanya jika punya sudut unik";
    else verdict = "HINDARI — skor peluang rendah";

    return { opportunityScore, breakdown, quadrant, profitPerMonth,
             entryPrice, ageDist, verdict };
  }

  global.RMAnalytics = { analyze, unitsPerMonth, revenuePerMonth, layakIklan, momentum };
})(typeof window !== "undefined" ? window : this);
