/* panel.js — build the injected "Riset Market" panel from an analysis object. */
(function (global) {
  "use strict";
  const { fmtRp, fmtNum, barChart, rankedBars } = global.RMCharts;


  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }
  function safeHref(v) {
    try {
      const u = new URL(String(v || ""), location.href);
      return /^https?:$/.test(u.protocol) ? esc(u.href) : "";
    } catch (_) { return ""; }
  }
  function card(title, value, cls) {
    return `<div class="rm-card${cls ? " " + cls : ""}"><div class="rm-card-t">${title}</div>` +
           `<div class="rm-card-v">${value}</div></div>`;
  }

  function sortHead(label, col, type) {
    return `<th>${label} <button class="rm-sort" data-col="${col}" data-type="${type || "text"}" title="Urutkan ${label}">↕</button></th>`;
  }

  /* ---- v0.9.27: listing-page summary from the SHARED decision engine ----
   * Every product on the page carries p.decision (analytics.js -> productpage
   * decide()): the same verdict, predicted ROAS (80% band) and Max CPC Meta the
   * product page shows. Without an imported snapshot there are no decisions,
   * and the old PRO-score summary is shown with a clear "impor snapshot" note. */
  const VERDICT_ORDER = ["IKLANKAN", "LAYAK COBA", "UJI KECIL", "HATI-HATI", "LEWATI"];
  const VERDICT_CLS = { "IKLANKAN": "rm-green", "LAYAK COBA": "rm-green", "UJI KECIL": "rm-yellow",
                        "HATI-HATI": "rm-yellow", "LEWATI": "rm-red" };
  function nicheLabel(k) {
    return (global.RMNiche && global.RMNiche.LABEL && global.RMNiche.LABEL[k]) || k || "?";
  }
  function decided(a) {
    return (a.products || []).filter((p) => p && p.decision && Number.isFinite(p.decision.roas));
  }
  // page products in the shape RMBandit.plan expects
  function planItems(list) {
    return list.map((p) => ({
      id: p.id, name: p.name, href: p.href, niche: p.niche,
      epcTag: p.suggestedTag || null, epcZero: !!(p.epcPred && p.epcPred.zeroConverter),
      roas: p.epcPred ? p.epcPred.roas : null, roasSd: p.epcPred ? p.epcPred.roasSd : null
    }));
  }

  function headerCards(a) {
    const ds = decided(a);
    if (!ds.length) return legacyHeaderCards(a);
    const count = {};
    VERDICT_ORDER.forEach((v) => { count[v] = 0; });
    ds.forEach((p) => { count[p.decision.action] = (count[p.decision.action] || 0) + 1; });
    const plan = global.RMBandit ? global.RMBandit.plan(planItems(ds), { k: 3 }) : null;
    const weak = !plan || !plan.picks.length || plan.picks.every((r) => r.pAbove1 < 0.10);
    const nGo = count["IKLANKAN"] + count["LAYAK COBA"];
    const verdictLine = nGo > 0
      ? `<span class="rm-badge rm-green">${nGo} produk diprediksi untung</span>`
      : !weak ? `<span class="rm-badge rm-yellow">belum ada yang terbukti, ada yang layak diuji kecil</span>`
      : `<span class="rm-badge rm-red">tidak ada kandidat layak di halaman ini</span>`;
    const best = ds.slice().sort((x, y) => y.decision.roas - x.decision.roas)[0];
    const nicheCount = {};
    ds.forEach((p) => { const k = p.niche || "lainnya"; nicheCount[k] = (nicheCount[k] || 0) + 1; });
    const nicheTxt = Object.entries(nicheCount).sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${v} ${esc(nicheLabel(k))}`).join(" · ");
    const top = plan && plan.picks[0];
    return `<div class="rm-verdict">${verdictLine} <b>` +
      VERDICT_ORDER.filter((v) => count[v]).map((v) =>
        `<span class="${VERDICT_CLS[v]}">${count[v]} ${v.toLowerCase()}</span>`).join(" · ") +
      `</b> dari ${ds.length} produk</div>` +
      `<div class="rm-cards">` +
      card("Uji dulu (Thompson)", top && !weak
        ? `${esc((top.item.name || "").slice(0, 24))} <small>${Math.round(top.pPick * 100)}% terpilih</small>` : "—") +
      card("Prediksi ROAS terbaik", best ? `${best.decision.roas.toFixed(2)}x <small>${esc((best.name || "").slice(0, 20))}</small>` : "—",
        best && best.decision.roasLow >= 1 ? "rm-green" : "") +
      card("Max CPC Meta terbaik", best && Number.isFinite(best.decision.maxCpc)
        ? `Rp${fmtNum(Math.round(best.decision.maxCpc))} <small>CPC kamu Rp${fmtNum(Math.round(best.decision.cpc || 0))}</small>` : "—") +
      card("Niche di halaman ini", nicheTxt || "—") +
      `</div>`;
  }

  function legacyHeaderCards(a) {
    // Click-affiliate summary: how many products are worth advertising, and the
    // best Max CPC available — NOT abstract market size / saturation.
    const scored = a.products.filter((p) => p.pro);
    const count = (act) => scored.filter((p) => p.pro.action === act).length;
    const nGo = count("IKLANKAN"), nTry = count("LAYAK COBA");
    const nSkip = count("SKIP") + count("LEMAH");
    const best = scored.slice().sort((x, y) => y.pro.pro - x.pro.pro)[0] || null;
    const bestCpc = scored.slice().sort((x, y) =>
      (y.pro.economics.maxProfitableCPC || 0) - (x.pro.economics.maxProfitableCPC || 0))[0] || null;

    const verdictLine = nGo > 0
      ? `<span class="rm-badge rm-green">${nGo} produk siap diiklankan</span>`
      : (nTry > 0 ? `<span class="rm-badge rm-yellow">tidak ada yang kuat — ${nTry} layak dicoba</span>`
                  : `<span class="rm-badge rm-red">tidak ada kandidat bagus di halaman ini</span>`);

    return `<div class="rm-note">Belum ada snapshot performa, jadi ini masih skor PRO lama (bobot manual, bukan prediksi). ` +
      `Impor snapshot di Admin Panel → Feedback Loop untuk vonis, prediksi ROAS dan rencana uji.</div>` +
      `<div class="rm-verdict">${verdictLine} ` +
      `<b>${nGo} iklankan · ${nTry} coba · ${nSkip} lewati</b> dari ${scored.length} produk</div>` +
      `<div class="rm-cards">` +
      card("Kandidat terbaik", best ? `${best.pro.pro} — ${esc(best.name.slice(0, 22))}` : "—") +
      card("Max CPC tertinggi", bestCpc ? "Rp" + fmtNum(bestCpc.pro.economics.maxProfitableCPC) : "—") +
      card("Komisi tertinggi", (() => {
        const c = scored.map((p) => p.pro.economics.commissionPct).filter((x) => x != null);
        return c.length ? Math.max(...c) + "%" : "—";
      })()) +
      card("Produk dianalisa", fmtNum(a.productCount)) +
      `</div>`;
  }

  /* Forest plot: predicted ROAS (dot) + 80% band per product, break-even at 1x.
   * The one chart that answers "which of these can make money, and how sure". */
  function roasForest(ds) {
    const rows = ds.slice().sort((x, y) => y.decision.roas - x.decision.roas).slice(0, 10);
    if (!rows.length) return "";
    const W = 600, ROW = 22, L = 200, R = 46, T = 8, H = T + rows.length * ROW + 22;
    const max = Math.max(2, ...rows.map((p) => Math.min(p.decision.roasHigh || 0, 6))) * 1.05;
    const X = (v) => L + (Math.max(0, Math.min(v, max)) / max) * (W - L - R);
    const COL = { "rm-green": "#06a94d", "rm-yellow": "#e0a800", "rm-red": "#c0392b" };
    let s = `<svg class="rm-forest" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Prediksi ROAS per produk dengan rentang 80%">`;
    s += `<rect x="${L}" y="${T - 4}" width="${X(1) - L}" height="${rows.length * ROW + 4}" fill="#fdecea"/>`;
    s += `<line x1="${X(1)}" y1="${T - 4}" x2="${X(1)}" y2="${T + rows.length * ROW}" stroke="#222" stroke-dasharray="4 3"/>`;
    s += `<text x="${X(1)}" y="${H - 6}" font-size="10" text-anchor="middle" fill="#222">balik modal 1x</text>`;
    s += `<text x="${W - R}" y="${H - 6}" font-size="10" text-anchor="end" fill="#999">${max.toFixed(1)}x</text>`;
    rows.forEach((p, i) => {
      const y = T + i * ROW + ROW / 2, d = p.decision, col = COL[d.cls] || "#888";
      const lo = Number.isFinite(d.roasLow) ? d.roasLow : d.roas, hi = Number.isFinite(d.roasHigh) ? d.roasHigh : d.roas;
      s += `<text x="${L - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="#222">${esc((p.name || "").slice(0, 30))}</text>`;
      s += `<rect x="${X(lo)}" y="${y - 4}" width="${Math.max(2, X(hi) - X(lo))}" height="8" rx="4" fill="${col}" opacity=".35"/>`;
      s += `<circle cx="${X(d.roas)}" cy="${y}" r="5" fill="${col}"/>`;
      s += `<text x="${W - R + 6}" y="${y + 4}" font-size="11" fill="#222">${d.roas.toFixed(2)}x</text>`;
    });
    s += `</svg>`;
    return `<div class="rm-chart rm-forest-box"><div class="rm-chart-t">🎯 Prediksi ROAS per produk ` +
      `<span class="rm-sub">(titik = prediksi, pita = rentang 80%, area merah = rugi)</span></div>${s}</div>`;
  }

  function charts(a, cfg) {
    if (!cfg.showCharts) return "";
    const ds = decided(a);
    if (ds.length) {
      return `<div class="rm-charts rm-charts-v2">` + roasForest(ds) +
        `<div class="rm-chart">${testPlanBlock(planItems(ds), "di halaman ini")}</div>` +
        `</div>`;
    }
    return legacyCharts(a);
  }

  function legacyCharts(a) {
    const ACT_COLOR = { "IKLANKAN": "#06a94d", "LAYAK COBA": "#3aa76d",
                        "HATI-HATI": "#e0a800", "LEMAH": "#d9534f", "SKIP": "#9c0006" };
    const scored = a.products.filter((p) => p.pro).slice();

    // 1) ranking by PRO SCORE — "produk mana yang harus aku iklankan"
    const byPro = scored.sort((x, y) => y.pro.pro - x.pro.pro).slice(0, 10)
      .map((p) => ({ label: p.name, value: p.pro.pro,
                     color: ACT_COLOR[p.pro.action] || "#ee4d2d" }));

    // 2) ranking by Max CPC — "berapa boleh aku bayar per klik"
    const byCpc = scored.slice()
      .sort((x, y) => (y.pro.economics.maxProfitableCPC || 0) - (x.pro.economics.maxProfitableCPC || 0))
      .slice(0, 10)
      .map((p) => ({ label: p.name, value: p.pro.economics.maxProfitableCPC || 0,
                     color: ACT_COLOR[p.pro.action] || "#ee4d2d" }));

    return `<div class="rm-charts">` +
      rankedBars(byPro, "🏆 Top produk — PRO SCORE (klik nama di tabel untuk detail)") +
      rankedBars(byCpc, "💰 Max CPC — batas bayar per klik agar tetap untung", "rp") +
      `</div>`;
  }

  const ACTION_CLASS = {
    "PROMOSIKAN": "rm-green", "LAYAK COBA": "rm-green", "HATI-HATI": "rm-yellow",
    "LEWATI": "rm-red", "HINDARI": "rm-red"
  };

  // ---- drill-down modal: deep per-product analysis ----
  function starBars(breakdown, total) {
    if (!breakdown || !breakdown.length || !total) return "<div class='rm-sub'>Rincian rating tidak tersedia</div>";
    let html = "";
    for (let s = 5; s >= 1; s--) {
      const cnt = breakdown[s - 1] || 0;
      const pct = total ? Math.round(cnt / total * 100) : 0;
      html += `<div class="rm-star-row"><span>${s}★</span>` +
        `<div class="rm-star-track"><div class="rm-star-fill" style="width:${pct}%"></div></div>` +
        `<span>${pct}% (${fmtNum(cnt)})</span></div>`;
    }
    return html;
  }

  function buildDetailModal(product, detail, pro, epc) {
    const wrap = document.createElement("div");
    wrap.className = "rm-modal-bg";
    const d = detail || {};
    const safeName = esc(d.name || product.name || "");
    const href = safeHref(product.href);
    const safeId = esc(product.id || "");
    const proVal = (pro && pro.pro) || 0;
    // PRO >= 75 -> green "hot pick" theme (75 itself counts as hot)
    const modalClass = proVal >= 75 ? "rm-modal rm-modal-hot" : "rm-modal";
    const pos = d.starBreakdown && d.totalReviews
      ? Math.round(((d.starBreakdown[3] || 0) + (d.starBreakdown[4] || 0)) / d.totalReviews * 100) : null;
    const ec = (pro && pro.economics) || {};
    wrap.innerHTML =
      `<div class="${modalClass}">` +
      `<div class="rm-modal-head"><b>${safeName}</b>` +
      `<button class="rm-modal-x">✕</button></div>` +
      `<div class="rm-modal-body">` +
      (d.error ? `<div class="rm-note">Detail gagal dimuat: ${esc(d.error)}. Data kartu tetap dipakai.</div>` : "") +
      `<div class="rm-cards">` +
      card("PRO SCORE", (pro ? pro.pro + " " + pro.action : "?")) +
      (epc ? card("EPC SCORE", epc.score + " " + epc.action,
        epc.zeroConverter ? "rm-red" : epc.score >= 65 ? "rm-green" : epc.score >= 50 ? "" : epc.score >= 35 ? "rm-yellow" : "rm-red") : "") +
      card("Harga", fmtRp(d.price || product.price)) +
      card("Komisi", (ec.commissionPct != null ? ec.commissionPct + "%" : "?")) +
      `</div>` +
      (epc ? `<div class="rm-sub rm-epc-line">🔮 <b>Prediksi EPC: Rp${fmtNum(Math.round(epc.epc))}/klik</b> ` +
        `<span class="rm-epc-band">(rentang Rp${fmtNum(Math.round(epc.epc_low))}–Rp${fmtNum(Math.round(epc.epc_high))})</span> · ` +
        `keyakinan <b>${epc.confidence}</b> (${epc.basis === "tag" ? "dari riwayat tag" : "prior global — produk baru"})` +
        (epc.pProfit != null ? ` · <b>P(untung) ${Math.round(epc.pProfit * 100)}%</b> vs CPC Rp${fmtNum(epc.breakEvenCpc)}` : "") +
        (epc.zeroConverter ? ` · <b style="color:#c0392b">TERBUKTI 0 ORDER</b>` : "") +
        `</div>` : "") +
      `<div class="rm-cards">` +
      card("Max CPC (untung)", "Rp" + fmtNum(ec.maxProfitableCPC || 0) +
        (ec.basis === "tag" ? " ✅" : ec.basis === "global" ? " ~" : " ⚠️")) +
      card("Rating", (d.rating != null ? "⭐ " + d.rating : "?")) +
      card("Total Review", (d.totalReviews != null ? fmtNum(d.totalReviews) : "?")) +
      card("Terjual (total)", (d.historicalSold != null ? fmtNum(d.historicalSold) : "?")) +
      card("Stok", (d.stock != null ? fmtNum(d.stock) : "?")) +
      `</div>` +
      `<div class="rm-cards">` +
      card("Favorit", (d.likedCount != null ? fmtNum(d.likedCount) : "?")) +
      card("Umur listing", (d.ageMonths != null ? d.ageMonths + " bln" : "?")) +
      card("Lokasi toko", (d.shopLocation || "?")) +
      card("Official?", (d.isOfficial ? "Ya" : "Tidak")) +
      `</div>` +
      `<div class="rm-section-t">Rincian Rating</div>` +
      `<div class="rm-stars">${starBars(d.starBreakdown, d.totalReviews)}</div>` +
      (pos != null ? `<div class="rm-sub">${pos}% review 4–5★ (indikator kepercayaan konversi)</div>` : "") +
      `<div class="rm-section-t">Analisa Affiliate (pilar)</div>` +
      `<div class="rm-pillars">` +
      (pro ? Object.entries(pro.pillars).map(([k, v]) =>
        `<div class="rm-pillar"><span>${k}</span><div class="rm-star-track"><div class="rm-star-fill" style="width:${v}%"></div></div><span>${v}</span></div>`).join("") : "") +
      `</div>` +
      (pro && pro.gates && pro.gates.length ? `<div class="rm-note">⚠ ${esc(pro.gates.join("; "))}</div>` : "") +
      `<div class="rm-exp"><b>Campaign Meta = Tag Shopee</b><span>Generate caption/video untuk membuat ID otomatis.</span></div>` +
      `<div class="rm-foot">` +
      (href ? `<a class="rm-export" href="${href}" target="_blank" rel="noopener">Buka di Shopee ↗</a> ` : "") +
      (global.RMVideo && global.RMVideo.hasVideo() ? `<button class="rm-video" data-id="${safeId}">⬇ Video</button> ` : "") +
      (global.RMGahwa && global.RMDetailScrape && global.RMDetailScrape.isProductPage()
        ? `<button class="rm-gahwa" data-id="${safeId}" title="Unduh semua gambar, video & teks produk ini untuk engine Gahwa">🎞 Gahwa Pack</button> ` : "") +
      `<button class="rm-vprompt" data-id="${safeId}">🎬 Prompt Video</button> ` +
      `<button class="rm-exp-new" data-id="${safeId}" title="Buat ID baru dan rotasi ke konsep berikutnya">＋ Eksperimen Baru</button> ` +
      `<button class="rm-star2" data-id="${safeId}">⭐ Simpan</button>` +
      `<button class="rm-ai2" data-id="${safeId}">✨ Caption</button>` +
      `<button class="rm-capture" data-id="${safeId}" title="Data produk ini sudah dikumpulkan otomatis. Klik untuk menyegarkan/memastikan tersimpan.">💾 Refresh Data Training</button>` +
      `</div>` +
      `<div class="rm-out" style="display:none"></div></div></div>`;
    return wrap;
  }

  // ---- cumulative shortlist (bulk scan across pages/categories) ----
  // Collapsed = top 20 by PRO score. Expanded = every product ever scanned.
  const SHORT_TOP = 20;

  // v0.9.27 cells: niche, predicted ROAS (80% band), Max CPC Meta, verdict —
  // all from the shared decision engine stored on the entry by shortlist.js.
  function shortlistRoasCell(x) {
    if (x.verdict == null || x.roas == null) {
      return `<span class="rm-badge rm-grey" title="Produk ini dipindai sebelum v0.9.27 atau sebelum snapshot performa diimpor. Impor di Admin Panel → Feedback Loop lalu scan ulang.">— scan ulang</span>`;
    }
    const cls = x.verdictCls || (x.roas >= 1 ? "rm-green" : "rm-red");
    const tip = `Prediksi ROAS ${x.roas.toFixed(2)}x, rentang 80% ${x.roasLow != null ? x.roasLow.toFixed(2) : "?"}–` +
      `${x.roasHigh != null ? x.roasHigh.toFixed(2) : "?"}x · EPC Rp${fmtNum(x.epc)}/klik Shopee` +
      (x.epcTag ? ` · dari riwayat tag &quot;${esc(x.epcTag)}&quot;` : " · rata-rata niche (produk baru)");
    return `<b class="${cls}" title="${tip}">${x.roas.toFixed(2)}x</b>` +
      `<div class="rm-epc-sub">${x.roasLow != null ? x.roasLow.toFixed(2) : "?"}–${x.roasHigh != null ? x.roasHigh.toFixed(2) : "?"}x</div>`;
  }
  function shortlistVerdictCell(x) {
    if (x.epcZero) return `<span class="rm-badge rm-red">LEWATI</span><div class="rm-epc-sub">terbukti 0 order</div>`;
    if (x.verdict) {
      return `<span class="rm-badge ${x.verdictCls || "rm-grey"}">${esc(x.verdict)}</span>` +
        `<div class="rm-epc-sub">${x.epcTag ? "tag " + esc(x.epcTag) : "produk baru"}</div>`;
    }
    const cls = ACTION_CLASS[x.action] || "rm-grey";
    return `<span class="rm-badge ${cls}" title="Skor PRO lama (bobot manual). Scan ulang untuk vonis baru.">PRO ${esc(x.pro)} ${esc(x.action)}</span>`;
  }

  function shortlistRow(x, i, fresh) {
    const href = safeHref(x.href);
    const safeName = esc(x.name || "");
    const safeId = esc(x.id || "");
    const safeKeyword = esc(x.keyword || "");
    const rating = x.rating != null ? `⭐${x.rating}` : "";
    const vRank = x.epcZero ? 0 : ({ "IKLANKAN": 5, "LAYAK COBA": 4, "UJI KECIL": 3, "HATI-HATI": 2, "LEWATI": 1 })[x.verdict] || 0;
    // Name is a DRILL target (deep-analysis modal), same as the old product
    // table. It carries data-id so content.js can resolve the product; the
    // Shopee link moves into the 🔗 action button so the name stays clickable
    // for drill-down.
    return `<tr>` +
      `<td class="rm-sl-rank" data-sort="${i + 1}">${i + 1}</td>` +
      `<td class="rm-name rm-drill" data-sort="${safeName}" data-id="${safeId}" title="Klik untuk analisa mendalam: ${safeName}">${fresh ? `<span class="rm-new-badge">BARU</span> ` : ""}${esc((x.name || "").slice(0, 44))} <span class="rm-drill-hint">🔍</span></td>` +
      `<td data-sort="${x.price == null ? -1 : x.price}">${x.price != null ? fmtRp(x.price) : "?"}</td>` +
      `<td data-sort="${x.commissionPct == null ? -1 : x.commissionPct}">${x.commissionPct != null ? x.commissionPct + "%" : "?"}</td>` +
      `<td data-sort="${x.rating == null ? -1 : x.rating}">${rating}</td>` +
      `<td data-sort="${esc(x.niche || "")}">${x.niche ? esc(nicheLabel(x.niche)) : "?"}</td>` +
      `<td data-sort="${x.roas == null || x.verdict == null ? -1 : x.roas}">${shortlistRoasCell(x)}</td>` +
      `<td data-sort="${x.maxCpcMeta == null ? -1 : x.maxCpcMeta}">${x.maxCpcMeta != null
        ? `<b>Rp${fmtNum(x.maxCpcMeta)}</b><div class="rm-epc-sub">CPC kamu Rp${fmtNum(x.cpcMeta || 0)}</div>` : "?"}</td>` +
      `<td data-sort="${vRank}">${shortlistVerdictCell(x)}</td>` +
      `<td class="rm-sl-kw" data-sort="${safeKeyword}">${esc((x.keyword || "").replace(/^cari:\s*/, "").slice(0, 16))}</td>` +
      `<td class="rm-actions">` +
      (href ? `<a class="rm-sl-open" href="${href}" target="_blank" rel="noopener" title="Buka di Shopee">🔗</a>` : "") +
      `<button class="rm-star" data-id="${safeId}" title="Simpan ke watchlist">☆</button>` +
      `<button class="rm-ai" data-id="${safeId}" title="Generate caption">✨</button></td>` +
      `</tr>`;
  }

  /* v0.9.26: Thompson-sampling test plan over the products currently shown.
   * Read-only block: no buttons, no handlers, so it cannot disturb bulk scan. */
  function testPlanBlock(items, scope) {
    const B = global.RMBandit;
    if (!B || !items || !items.length) return "";
    const r = B.plan(items, { k: 3 });
    if (r.eligible < 2) {
      return `<div class="rm-plan rm-sub">🎲 Rencana uji butuh prediksi ROAS. ` +
        `Impor snapshot terbaru di Admin Panel → Feedback Loop, lalu scan ulang.</div>`;
    }
    const NL = (global.RMNiche && global.RMNiche.LABEL) || {};
    const pc = (v) => (v >= 0.995 ? "≥99" : v <= 0.005 ? "≤1" : Math.round(v * 100)) + "%";
    const rows = r.picks.map((p, i) => {
      const x = p.item, href = safeHref(x.href);
      return `<tr><td>${i + 1}</td>` +
        `<td class="rm-name" title="${esc(x.name || "")}">${esc((x.name || "").slice(0, 48))}` +
        (href ? ` <a href="${href}" target="_blank" rel="noopener" title="Buka di Shopee">🔗</a>` : "") + `</td>` +
        `<td>${esc(NL[x.niche] || x.niche || "?")}</td>` +
        `<td>${x.epcTag ? "tag " + esc(x.epcTag) : "produk baru"}</td>` +
        `<td><b>${p.roas.toFixed(2)}x</b></td>` +
        `<td>${pc(p.pAbove1)}</td>` +
        `<td>${pc(p.pPick)}</td></tr>`;
    }).join("");
    // When even the best candidates almost surely lose, say so instead of
    // recommending a test (P(ROAS>=1) < 10% for every pick).
    const weak = r.picks.every((p) => p.pAbove1 < 0.10);
    return `<div class="rm-plan${weak ? " rm-plan-weak" : ""}">` +
      `<div class="rm-plan-t"><b>${weak ? "⚠ Belum ada kandidat yang layak diuji"
        : `🎲 Uji ${r.k} produk ini dulu`}</b> ` +
      `<span class="rm-sub">Thompson sampling, ${r.draws} simulasi dari ${r.eligible} kandidat ${esc(scope || "di seluruh riset")} · budget uji maks Rp30rb per produk</span></div>` +
      `<table class="rm-table rm-plan-table"><thead><tr><th>#</th><th>Produk</th><th>Niche</th><th>Dasar</th>` +
      `<th title="Prediksi ROAS (rata-rata posterior)">ROAS</th>` +
      `<th title="Peluang ROAS ≥ 1x menurut posterior">P(≥1x)</th>` +
      `<th title="Seberapa sering produk ini masuk ${r.k} besar dalam simulasi">Dipilih</th></tr></thead>` +
      `<tbody>${rows}</tbody></table>` +
      (weak ? `<div class="rm-sub">Ini ${r.k} terbaik dari yang ada, tapi peluang ROAS ≥1x semuanya di bawah 10%. ` +
        `Lebih baik scan niche lain (casing HP / rumah & dapur) daripada membakar budget uji di sini.</div>` : "") +
      (r.ties && !weak ? `<div class="rm-sub">${r.ties} dari ${r.k} pilihan punya prediksi yang sama persis dengan produk lain yang tidak terpilih ` +
        `(produk baru di niche yang sama). Di antara mereka urutannya untung-untungan, belum ada data yang membedakan.</div>` : "") +
      (r.skipped ? `<div class="rm-sub">${r.skipped} produk tidak ikut: terbukti 0 order, atau dipindai sebelum snapshot v0.9.26 (scan ulang).</div>` : "") +
      `</div>`;
  }

  function shortlistSection(meta, expanded, filterKeyword, pageLabel) {
    const allItems = (meta && meta.items) || [];
    const SL = global.RMShortlist;
    const runView = !!(SL && SL.isRunFilter && SL.isRunFilter(filterKeyword));
    const items = !filterKeyword ? allItems
      : (SL && SL.filterItems) ? SL.filterItems(allItems, filterKeyword)
      : allItems.filter((x) => String(x.keyword || "") === String(filterKeyword));
    // "new in this run" = first entered the list during this run's time span
    const runStart = runView && items.length
      ? Math.min.apply(null, items.map((x) => x.at || Infinity)) : 0;
    const isNew = (x) => runView && (x.firstAt || 0) >= runStart;
    const newCount = runView ? items.filter(isNew).length : 0;
    if (!allItems.length) {
      return `<div class="rm-sl">` +
        `<div class="rm-sl-head"><b>🗂 Shortlist Kumulatif</b>` +
        `<span class="rm-sub">belum ada isinya</span>` +
        `<button class="rm-sl-bulk">▶ Bulk Scan Semua Kategori</button>` +
        `<label class="rm-sl-opt"><input type="checkbox" class="rm-sl-pages"> + halaman berikutnya</label>` +
        `<button class="rm-sl-stop ghost" style="display:none">■ Stop</button>` +
        `</div>` +
        `<div class="rm-sl-kwbar">` +
        `<input class="rm-sl-kwinput" type="text" placeholder="kata kunci dipisah koma: tumbler, casing iphone, tas anak" />` +
        `<button class="rm-sl-kwscan">🔎 Bulk Scan Keyword</button>` +
        `</div>` +
        `<div class="rm-sl-progress" style="display:none"></div>` +
        `</div>`;
    }
    const s = global.RMShortlist ? global.RMShortlist.stats(items) : { total: items.length };
    let list = global.RMShortlist
      ? global.RMShortlist.ranked(items, expanded ? 0 : SHORT_TOP)
      : items.slice(0, SHORT_TOP);
    if (runView) {   // new products on top, each group keeps its ranking
      list = list.filter(isNew).concat(list.filter((x) => !isNew(x)));
    }
    const hiddenCount = items.length - list.length;

    return `<div class="rm-sl">` +
      `<div class="rm-sl-head">` +
      `<b>${runView ? `🆕 Hasil bulk scan terakhir <span class="rm-sl-newcount">(${newCount} baru)</span>`
          : filterKeyword ? `🔎 ${esc(String(filterKeyword).replace(/^cari:\s*/, ""))}` : "🗂 Riset Produk (kumulatif)"}</b> ` +
      `<span class="rm-sl-stat">${items.length} ditampilkan · ${allItems.length} total · ${meta.scans || 0} scan · ` +
      `<span class="rm-green">${s.iklankan} iklankan</span> · ` +
      `<span class="rm-green">${s.coba} layak coba</span> · ` +
      `<span class="rm-yellow">${s.uji} uji kecil</span> · ` +
      `<span class="rm-yellow">${s.hati} hati-hati</span> · ` +
      `<span class="rm-red">${s.skip} lewati</span></span>` +
      // "Halaman ini" filters to products from the page currently open; "Semua"
      // clears back to the whole cumulative research list. Shown only when we
      // know the current page's label and are not already filtered to it.
      (pageLabel && !filterKeyword
        ? `<button class="rm-sl-page" data-label="${esc(pageLabel)}">Halaman ini</button>` : "") +
      (filterKeyword ? `<button class="rm-sl-all">Semua produk</button>` : "") +
      `<button class="rm-sl-toggle">${expanded ? "Tampilkan 20 teratas" : "Tampilkan semua (" + s.total + ")"}</button>` +
      `<button class="rm-sl-bulk">▶ Bulk Scan Semua Kategori</button>` +
      `<label class="rm-sl-opt"><input type="checkbox" class="rm-sl-pages"> + halaman berikutnya</label>` +
      `<button class="rm-sl-stop ghost" style="display:none">■ Stop</button>` +
      `<button class="rm-sl-export">⬇ CSV</button>` +
      `<button class="rm-sl-clear ghost">Kosongkan</button>` +
      `</div>` +
      `<div class="rm-sl-kwbar">` +
      `<input class="rm-sl-kwinput" type="text" placeholder="kata kunci dipisah koma: tumbler, casing iphone, tas anak" />` +
      `<button class="rm-sl-kwscan">🔎 Bulk Scan Keyword</button>` +
      `</div>` +
      `<div class="rm-sl-progress" style="display:none"></div>` +
      testPlanBlock(items, filterKeyword ? "di daftar ini" : "di seluruh riset") +
      `<table class="rm-table rm-sl-table rm-sortable"><thead><tr>` +
      sortHead("#", 0, "number") + sortHead("Produk", 1, "text") +
      sortHead("Harga", 2, "number") + sortHead("Komisi", 3, "number") +
      sortHead("Rating", 4, "number") + sortHead("Niche", 5, "text") +
      sortHead("Prediksi ROAS", 6, "number") + sortHead("Max CPC Meta", 7, "number") +
      sortHead("Vonis", 8, "number") +
      sortHead("Kata kunci", 9, "text") + `<th></th>` +
      `</tr></thead><tbody>` +
      list.map((x, i) => shortlistRow(x, i, isNew(x))).join("") +
      `</tbody></table>` +
      (!expanded && hiddenCount > 0
        ? `<div class="rm-sub">+${hiddenCount} produk lain disembunyikan — klik "Tampilkan semua".</div>` : "") +
      `</div>`;
  }

  function build(a, cfg) {
    const wrap = document.createElement("div");
    wrap.className = "rm-panel";
    wrap.innerHTML =
      `<div class="rm-head"><span class="rm-logo">📊 Riset Market</span>` +
      `<span class="rm-kw">"${esc(a.keyword)}"</span>` +
      `<button class="rm-toggle">${cfg.panelCollapsed ? "Tampilkan" : "Sembunyikan"}</button></div>` +
      `<div class="rm-body" ${cfg.panelCollapsed ? 'style="display:none"' : ""}>` +
      headerCards(a) + charts(a, cfg) +
      `<div class="rm-sl-host"></div>` +
      `<div class="rm-note">Angka Terjual/bln & Omset = ESTIMASI dari data publik Shopee, bukan angka resmi. Untuk arah, bukan presisi.</div>` +
      `<div class="rm-foot"><button class="rm-export">⬇ Export watchlist (CSV)</button>` +
      `<button class="rm-log-export">⬇ Log aktivitas</button>` +
      `<button class="rm-log-clear ghost">Hapus log</button></div>` +
      `</div>`;
    return wrap;
  }

  global.RMPanel = { build, buildDetailModal, shortlistSection, testPlanBlock };
})(typeof window !== "undefined" ? window : this);
