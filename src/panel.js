/* panel.js — build the injected "Riset Market" panel from an analysis object. */
(function (global) {
  "use strict";
  const { fmtRp, fmtNum, barChart, rankedBars } = global.RMCharts;

  const VERDICT_CLASS = { "LAYAK": "rm-green", "HATI-HATI": "rm-yellow", "SUSAH": "rm-red", "?": "rm-grey" };

  function card(title, value, cls) {
    return `<div class="rm-card${cls ? " " + cls : ""}"><div class="rm-card-t">${title}</div>` +
           `<div class="rm-card-v">${value}</div></div>`;
  }

  function headerCards(a) {
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

    return `<div class="rm-verdict">${verdictLine} ` +
      `<b>${nGo} iklankan · ${nTry} coba · ${nSkip} lewati</b> dari ${scored.length} produk</div>` +
      `<div class="rm-cards">` +
      card("Kandidat terbaik", best ? `${best.pro.pro} — ${best.name.slice(0, 22)}` : "—") +
      card("Max CPC tertinggi", bestCpc ? "Rp" + fmtNum(bestCpc.pro.economics.maxProfitableCPC) : "—") +
      card("Komisi tertinggi", (() => {
        const c = scored.map((p) => p.pro.economics.commissionPct).filter((x) => x != null);
        return c.length ? Math.max(...c) + "%" : "—";
      })()) +
      card("Produk dianalisa", fmtNum(a.productCount)) +
      `</div>`;
  }

  function charts(a, cfg) {
    if (!cfg.showCharts) return "";
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

  function productRow(p) {
    const pro = p.pro || { pro: 0, action: "?", economics: {}, pillars: {} };
    const ec = pro.economics || {};
    const mom = p.momentum ? `<span class="rm-badge rm-green">🔥</span>` : "";
    const gateTip = pro.gates && pro.gates.length ? ` title="${pro.gates.join("; ")}"` : "";
    const rating = p.rating != null ? `⭐${p.rating}` : "";
    return `<tr>` +
      `<td class="rm-name rm-drill" data-id="${p.id}" title="Klik untuk analisa mendalam: ${p.name}">${p.name.slice(0, 44)} ${mom} <span class="rm-drill-hint">🔍</span></td>` +
      `<td>${fmtRp(p.price)}</td>` +
      `<td>${ec.commissionPct != null ? ec.commissionPct + "%" : "?"}</td>` +
      `<td>${p.unitsPerMonth != null ? fmtNum(p.unitsPerMonth) : "?"}</td>` +
      `<td>${rating}</td>` +
      `<td><b>Rp${fmtNum(ec.maxProfitableCPC || 0)}</b></td>` +
      `<td><span class="rm-badge ${ACTION_CLASS[pro.action] || "rm-grey"}"${gateTip}>${pro.pro} ${pro.action}</span></td>` +
      `<td>${epcCell(p.epcPred)}</td>` +
      `<td class="rm-actions"><button class="rm-star" data-id="${p.id}">☆</button>` +
      `<button class="rm-ai" data-id="${p.id}">✨</button></td>` +
      `</tr>`;
  }

  // EPC cell for the listing table. When no snapshot is imported we say so
  // EXPLICITLY rather than rendering an empty cell — a blank column looks like a
  // broken feature, and the real cause is "Feedback Loop belum diimpor".
  function epcCell(pred) {
    if (!pred) {
      return `<span class="rm-badge rm-grey" title="Impor snapshot performa di Admin Panel → Feedback Loop supaya prediksi EPC aktif">— impor snapshot</span>`;
    }
    const cls = pred.zeroConverter ? "rm-red"
      : pred.score >= 65 ? "rm-green"
      : pred.score >= 50 ? "rm-yellow"
      : pred.score >= 35 ? "rm-yellow" : "rm-red";
    const tip = `Prediksi EPC Rp${fmtNum(Math.round(pred.epc))}/klik ` +
      `(rentang Rp${fmtNum(Math.round(pred.epc_low))}–Rp${fmtNum(Math.round(pred.epc_high))}), ` +
      `keyakinan ${pred.confidence}, basis ${pred.basis === "tag" ? "riwayat tag" : "prior global"}`;
    return `<span class="rm-badge ${cls}" title="${tip}">${pred.score} ${pred.action}</span>` +
      `<div class="rm-epc-sub">Rp${fmtNum(Math.round(pred.epc))}/klik · ${pred.confidence}</div>`;
  }

  function productTable(a) {
    const rows = a.products
      .slice()
      .sort((x, y) => ((y.pro && y.pro.pro) || 0) - ((x.pro && x.pro.pro) || 0))
      .map(productRow).join("");
    return `<table class="rm-table"><thead><tr>` +
      `<th>Produk</th><th>Harga</th><th>Komisi</th><th>Terjual/bln</th><th>Rating</th>` +
      `<th title="CPC maksimum yang masih untung">Max CPC</th>` +
      `<th title="Skor pro 0-100 + rekomendasi aksi">PRO SCORE</th>` +
      `<th title="Prediksi EPC (Empirical Bayes) — angka = % peluang untung, di bawahnya Rp/klik prediksi">EPC SCORE</th>` +
      `<th></th></tr></thead>` +
      `<tbody>${rows}</tbody></table>` +
      `<div class="rm-note">Max CPC = batas biaya/klik yang masih untung (komisi × konversi). ` +
      `Jangan bayar iklan di atas angka ini. Rating/umur dari data publik Shopee (best-effort).</div>`;
  }

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
    const proVal = (pro && pro.pro) || 0;
    // PRO >= 75 -> green "hot pick" theme (75 itself counts as hot)
    const modalClass = proVal >= 75 ? "rm-modal rm-modal-hot" : "rm-modal";
    const pos = d.starBreakdown && d.totalReviews
      ? Math.round(((d.starBreakdown[3] || 0) + (d.starBreakdown[4] || 0)) / d.totalReviews * 100) : null;
    const ec = (pro && pro.economics) || {};
    wrap.innerHTML =
      `<div class="${modalClass}">` +
      `<div class="rm-modal-head"><b>${d.name || product.name}</b>` +
      `<button class="rm-modal-x">✕</button></div>` +
      `<div class="rm-modal-body">` +
      (d.error ? `<div class="rm-note">Detail gagal dimuat: ${d.error}. Data kartu tetap dipakai.</div>` : "") +
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
      (pro && pro.gates && pro.gates.length ? `<div class="rm-note">⚠ ${pro.gates.join("; ")}</div>` : "") +
      `<div class="rm-foot">` +
      (product.href ? `<a class="rm-export" href="${product.href}" target="_blank">Buka di Shopee ↗</a> ` : "") +
      (global.RMVideo && global.RMVideo.hasVideo() ? `<button class="rm-video" data-id="${product.id}">⬇ Video</button> ` : "") +
      `<button class="rm-vprompt" data-id="${product.id}">🎬 Prompt Video</button> ` +
      `<button class="rm-star2" data-id="${product.id}">⭐ Simpan</button>` +
      `<button class="rm-ai2" data-id="${product.id}">✨ Caption</button>` +
      `<button class="rm-capture" data-id="${product.id}" title="Data produk ini sudah dikumpulkan otomatis. Klik untuk menyegarkan/memastikan tersimpan.">💾 Refresh Data Training</button>` +
      `</div>` +
      `<div class="rm-learn">` +
      `<input class="rm-learn-tag" type="text" placeholder="campaign tag (= tag Shopee, mis. KupuA17)" value="${(product.suggestedTag||'').replace(/"/g,'')}">` +
      `<input class="rm-learn-why" type="text" placeholder="kenapa coba ini? (wajib, singkat: murah+rating tinggi)">` +
      `<button class="rm-learn-ext" title="Untuk konten yang kamu DOWNLOAD dari TikTok (bukan generate di sini): catat campaign + alasannya supaya tetap masuk learning ledger">+ Catat campaign eksternal</button>` +
      `</div>` +
      `<div class="rm-out" style="display:none"></div></div></div>`;
    return wrap;
  }

  // ---- cumulative shortlist (bulk scan across pages/categories) ----
  // Collapsed = top 20 by PRO score. Expanded = every product ever scanned.
  const SHORT_TOP = 20;

  // EPC cell for a STORED shortlist entry (fields persisted by shortlist.js).
  // Entries scanned before a snapshot was imported have no epcScore — say so
  // explicitly and tell the user the fix (import + rescan), never render blank.
  function shortlistEpcCell(x) {
    if (x.epcScore == null) {
      return `<span class="rm-badge rm-grey" title="Produk ini dipindai sebelum snapshot performa diimpor. Impor di Admin Panel → Feedback Loop lalu scan ulang.">— scan ulang</span>`;
    }
    const cls = x.epcZero ? "rm-red"
      : x.epcScore >= 65 ? "rm-green"
      : x.epcScore >= 35 ? "rm-yellow" : "rm-red";
    const tip = `Prediksi Rp${fmtNum(x.epc)}/klik ` +
      `(rentang Rp${fmtNum(x.epcLow)}–Rp${fmtNum(x.epcHigh)}), keyakinan ${x.epcConfidence}` +
      (x.epcTag ? `, dari riwayat tag "${x.epcTag}"` : ", prior global (produk baru)");
    return `<span class="rm-badge ${cls}" title="${tip}">${x.epcScore}</span>` +
      `<div class="rm-epc-sub">Rp${fmtNum(x.epc)}/klik · ${x.epcConfidence}</div>`;
  }

  function shortlistRow(x, i) {
    const cls = ACTION_CLASS[x.action] || "rm-grey";
    const basisIcon = x.basis === "tag" ? "✅" : x.basis === "global" ? "~" : "⚠️";
    const nm = x.href
      ? `<a href="${x.href}" target="_blank" class="rm-sl-link">${(x.name || "").slice(0, 46)}</a>`
      : (x.name || "").slice(0, 46);
    return `<tr>` +
      `<td class="rm-sl-rank">${i + 1}</td>` +
      `<td class="rm-name">${nm}</td>` +
      `<td>${x.price != null ? fmtRp(x.price) : "?"}</td>` +
      `<td>${x.commissionPct != null ? x.commissionPct + "%" : "?"}</td>` +
      `<td><b>Rp${fmtNum(x.maxCPC || 0)}</b> ${basisIcon}</td>` +
      `<td>${shortlistEpcCell(x)}</td>` +
      `<td><span class="rm-badge ${cls}">${x.pro} ${x.action}</span></td>` +
      `<td class="rm-sl-kw">${(x.keyword || "").slice(0, 18)}</td>` +
      `</tr>`;
  }

  function shortlistSection(meta, expanded) {
    const items = (meta && meta.items) || [];
    if (!items.length) {
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
    const s = global.RMShortlist ? RMShortlist.stats(items) : { total: items.length };
    const list = global.RMShortlist
      ? RMShortlist.ranked(items, expanded ? 0 : SHORT_TOP)
      : items.slice(0, SHORT_TOP);
    const hiddenCount = items.length - list.length;

    return `<div class="rm-sl">` +
      `<div class="rm-sl-head">` +
      `<b>🗂 Shortlist Kumulatif</b> ` +
      `<span class="rm-sl-stat">${s.total} produk · ${meta.scans || 0} scan · ` +
      `<span class="rm-green">${s.iklankan} iklankan</span> · ` +
      `<span class="rm-yellow">${s.coba} coba</span> · ` +
      `<span class="rm-red">${s.skip} lewati</span></span>` +
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
      `<table class="rm-table rm-sl-table"><thead><tr>` +
      `<th>#</th><th>Produk</th><th>Harga</th><th>Komisi</th><th>Max CPC</th>` +
      `<th title="Prediksi EPC (Empirical Bayes): angka = % peluang untung">EPC</th>` +
      `<th>PRO</th><th>Dari kata kunci</th></tr></thead><tbody>` +
      list.map(shortlistRow).join("") +
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
      `<span class="rm-kw">"${a.keyword}"</span>` +
      `<button class="rm-toggle">${cfg.panelCollapsed ? "Tampilkan" : "Sembunyikan"}</button></div>` +
      `<div class="rm-body" ${cfg.panelCollapsed ? 'style="display:none"' : ""}>` +
      headerCards(a) + charts(a, cfg) + productTable(a) +
      `<div class="rm-sl-host"></div>` +
      `<div class="rm-note">Angka Terjual/bln & Omset = ESTIMASI dari data publik Shopee, bukan angka resmi. Untuk arah, bukan presisi.</div>` +
      `<div class="rm-foot"><button class="rm-export">⬇ Export watchlist (CSV)</button></div>` +
      `</div>`;
    return wrap;
  }

  global.RMPanel = { build, buildDetailModal, shortlistSection };
})(typeof window !== "undefined" ? window : this);
