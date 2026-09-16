/* proscore.js — CLICK-AFFILIATE product scoring.
 *
 * Fikri's model (stated 2026-09-13): he does NOT care what the product is. He
 * earns from CLICKS that convert to commission. So the right product = the one
 * most likely to (a) make people CLICK the ad, (b) CONVERT once clicked, and
 * (c) pay enough commission to beat the cost per click. Market saturation,
 * listing freshness, and "who dominates the category" are IRRELEVANT here —
 * a saturated product is fine (proven that people buy it).
 *
 * 4 pillars, weighted for a click-arbitrage affiliate:
 *   CLICK ECONOMICS 35 · CLICK APPEAL 30 · CONVERSION TRUST 25 · PROVEN DEMAND 10
 */
(function (global) {
  "use strict";
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // --- pillar 1: CLICK ECONOMICS — can a paid click be profitable? ---
  // Max CPC is the ceiling Fikri can pay per click. Where we have REALIZED data
  // (perf snapshot) we use measured EPC — the formula overstated it ~2.4x.
  // `calib` is the optional result of RMPerf.calibrate().
  function clickEconomics(p, cfg, calib) {
    const pct = (p.commissionPct != null && p.commissionPct > 0) ? p.commissionPct : cfg.commissionPct;
    const commissionPerOrder = p.price != null ? p.price * (pct / 100) : 0;
    const formulaVpc = commissionPerOrder * (cfg.conversionRate / 100);
    // realized EPC wins when available
    const valuePerClick = (calib && calib.epc != null) ? calib.epc : formulaVpc;
    const headroom = valuePerClick / cfg.breakEvenCPC;
    const score = clamp((headroom - 0.3) / (2.5 - 0.3) * 100, 0, 100);
    return { score, valuePerClick: Math.round(valuePerClick),
             commissionPerOrder: Math.round(commissionPerOrder),
             commissionPct: pct, headroom: +headroom.toFixed(2),
             maxProfitableCPC: Math.round(valuePerClick),
             basis: (calib && calib.basis) || "formula",
             matchedTag: (calib && calib.matchedTag) || null,
             formulaCPC: Math.round(formulaVpc),
             note: (calib && calib.note) || null };
  }

  // --- pillar 2: CLICK APPEAL — will people STOP scrolling and click? ---
  // Impulse price (cheaper = easier click), has video (better ad creative),
  // big discount (urgency), and strong social proof count as scroll-stoppers.
  function clickAppeal(p, cfg) {
    let s = 0;
    // impulse price: <Rp50k = max appeal, >Rp300k = low (considered purchase)
    if (p.price != null) {
      if (p.price <= 50000) s += 45;
      else if (p.price <= 150000) s += 35;
      else if (p.price <= 300000) s += 20;
      else s += 8;
    }
    // has a product video -> can build a scroll-stopping ad
    if (p.hasVideo) s += 20;
    // discount / urgency
    if (p.discountPct != null && p.discountPct >= 30) s += 15;
    else if (p.discountPct != null && p.discountPct >= 10) s += 8;
    // social proof as curiosity magnet (very high favorites/sold = "everyone's buying")
    if (p.likedCount != null && p.likedCount >= 10000) s += 20;
    else if (p.likedCount != null && p.likedCount >= 1000) s += 12;
    else if (p.soldTotal != null && p.soldTotal >= 5000) s += 12;
    return { score: clamp(s, 0, 100) };
  }

  // --- pillar 3: CONVERSION TRUST — once clicked, does it convert? ---
  function conversionTrust(p) {
    let s = 40;
    if (p.rating != null) s = clamp((p.rating - 3.5) / 1.5 * 55 + 15, 0, 70);
    if (p.reviewCount != null) s += clamp(Math.log10(Math.max(1, p.reviewCount)) / 4 * 20, 0, 20);
    // % of 4-5 star reviews if we have the breakdown
    if (p.starBreakdown && p.starBreakdown.length === 5) {
      const tot = p.starBreakdown.reduce((a, b) => a + b, 0);
      if (tot > 0) {
        const pos = (p.starBreakdown[3] + p.starBreakdown[4]) / tot;
        s += pos * 10;
      }
    }
    if (p.isOfficial || p.isMall) s = Math.min(100, s + 5);
    return { score: clamp(s, 0, 100),
             positivePct: p.starBreakdown && p.starBreakdown.length === 5
               ? Math.round((p.starBreakdown[3] + p.starBreakdown[4]) /
                   Math.max(1, p.starBreakdown.reduce((a, b) => a + b, 0)) * 100) : null };
  }

  // --- pillar 4: PROVEN DEMAND — do people actually buy it (any volume signal)? ---
  function provenDemand(p) {
    const u = p.unitsPerMonth != null ? p.unitsPerMonth : null;
    const total = p.soldTotal || 0;
    // prefer monthly; fall back to total sold as a proof-of-demand signal
    const basis = u != null ? u : total;
    const score = clamp(Math.log10(Math.max(1, basis)) / Math.log10(u != null ? 3000 : 30000) * 100, 0, 100);
    return { score, basis, usedMonthly: u != null };
  }

  function scoreProduct(p, cfg, market, calib) {
    const ec = clickEconomics(p, cfg, calib);
    const ca = clickAppeal(p, cfg);
    const ct = conversionTrust(p);
    const pd = provenDemand(p);

    const W = { ec: 0.35, ca: 0.30, ct: 0.25, pd: 0.10 };
    const pro = Math.round(ec.score * W.ec + ca.score * W.ca + ct.score * W.ct + pd.score * W.pd);

    // hard gates for a CLICK affiliate: only things that truly disqualify.
    const gates = [];
    if (calib && calib.zeroConverter) {
      gates.push("TERBUKTI 0 ORDER — " + (calib.note || "pola ini pernah dijalankan dan nol konversi"));
    }
    if (ec.valuePerClick < cfg.breakEvenCPC * 0.5) gates.push("ekonomi klik lemah (Max CPC di bawah biaya klik realistis)");
    if (p.rating != null && p.rating < 3.8) gates.push("rating buruk (<3.8) → klik tidak convert");

    let action;
    if (gates.length) action = "SKIP";
    else if (pro >= 70) action = "IKLANKAN";
    else if (pro >= 55) action = "LAYAK COBA";
    else if (pro >= 40) action = "HATI-HATI";
    else action = "LEMAH";

    return {
      pro, action, gates,
      pillars: { "ekonomi-klik": ec.score|0, "daya-klik": ca.score|0,
                 "konversi": ct.score|0, "permintaan": pd.score|0 },
      economics: ec, appeal: ca, trust: ct, demand: pd,
      calibrated: !!(calib && calib.basis && calib.basis !== "formula"),
      calibBasis: (calib && calib.basis) || "formula"
    };
  }

  global.RMProScore = { scoreProduct, clickEconomics, clickAppeal, conversionTrust, provenDemand };
})(typeof window !== "undefined" ? window : this);
