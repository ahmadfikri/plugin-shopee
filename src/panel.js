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
      card("Kandidat terbaik", best ? `${best.pro.pro} — ${esc(best.name.slice(0, 22))}` : "—") +
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
      (x.epcTag ? `, dari riwayat tag &quot;${esc(x.epcTag)}&quot;` : ", prior global (produk baru)");
    return `<span class="rm-badge ${cls}" title="${tip}">${x.epcScore}</span>` +
      `<div class="rm-epc-sub">Rp${fmtNum(x.epc)}/klik · ${x.epcConfidence}</div>`;
  }

  function shortlistRow(x, i) {
    const cls = ACTION_CLASS[x.action] || "rm-grey";
    const basisIcon = x.basis === "tag" ? "✅" : x.basis === "global" ? "~" : "⚠️";
    const href = safeHref(x.href);
    const safeName = esc(x.name || "");
    const safeId = esc(x.id || "");
    const safeKeyword = esc(x.keyword || "");
    const rating = x.rating != null ? `⭐${x.rating}` : "";
    // Name is a DRILL target (deep-analysis modal), same as the old product
    // table. It carries data-id so content.js can resolve the product; the
    // Shopee link moves into the 🔗 action button so the name stays clickable
    // for drill-down.
    return `<tr>` +
      `<td class="rm-sl-rank" data-sort="${i + 1}">${i + 1}</td>` +
      `<td class="rm-name rm-drill" data-sort="${safeName}" data-id="${safeId}" title="Klik untuk analisa mendalam: ${safeName}">${esc((x.name || "").slice(0, 44))} <span class="rm-drill-hint">🔍</span></td>` +
      `<td data-sort="${x.price == null ? -1 : x.price}">${x.price != null ? fmtRp(x.price) : "?"}</td>` +
      `<td data-sort="${x.commissionPct == null ? -1 : x.commissionPct}">${x.commissionPct != null ? x.commissionPct + "%" : "?"}</td>` +
      `<td data-sort="${x.rating == null ? -1 : x.rating}">${rating}</td>` +
      `<td data-sort="${x.maxCPC || 0}"><b>Rp${fmtNum(x.maxCPC || 0)}</b> ${basisIcon}</td>` +
      `<td data-sort="${x.epcScore == null ? -1 : x.epcScore}">${shortlistEpcCell(x)}</td>` +
      `<td data-sort="${x.pro || 0}"><span class="rm-badge ${cls}">${x.pro} ${x.action}</span></td>` +
      `<td class="rm-sl-kw" data-sort="${safeKeyword}">${esc((x.keyword || "").replace(/^cari:\s*/, "").slice(0, 16))}</td>` +
      `<td class="rm-actions">` +
      (href ? `<a class="rm-sl-open" href="${href}" target="_blank" rel="noopener" title="Buka di Shopee">🔗</a>` : "") +
      `<button class="rm-star" data-id="${safeId}" title="Simpan ke watchlist">☆</button>` +
      `<button class="rm-ai" data-id="${safeId}" title="Generate caption">✨</button></td>` +
      `</tr>`;
  }

  function shortlistSection(meta, expanded, filterKeyword, pageLabel) {
    const allItems = (meta && meta.items) || [];
    const items = filterKeyword
      ? allItems.filter((x) => String(x.keyword || "") === String(filterKeyword))
      : allItems;
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
    const list = global.RMShortlist
      ? global.RMShortlist.ranked(items, expanded ? 0 : SHORT_TOP)
      : items.slice(0, SHORT_TOP);
    const hiddenCount = items.length - list.length;

    return `<div class="rm-sl">` +
      `<div class="rm-sl-head">` +
      `<b>${filterKeyword ? `🔎 ${esc(String(filterKeyword).replace(/^cari:\s*/, ""))}` : "🗂 Riset Produk (kumulatif)"}</b> ` +
      `<span class="rm-sl-stat">${items.length} ditampilkan · ${allItems.length} total · ${meta.scans || 0} scan · ` +
      `<span class="rm-green">${s.iklankan} iklankan</span> · ` +
      `<span class="rm-yellow">${s.coba} coba</span> · ` +
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
      `<table class="rm-table rm-sl-table rm-sortable"><thead><tr>` +
      sortHead("#", 0, "number") + sortHead("Produk", 1, "text") +
      sortHead("Harga", 2, "number") + sortHead("Komisi", 3, "number") +
      sortHead("Rating", 4, "number") + sortHead("Max CPC", 5, "number") +
      sortHead("EPC", 6, "number") + sortHead("PRO", 7, "number") +
      sortHead("Kata kunci", 8, "text") + `<th></th>` +
      `</tr></thead><tbody>` +
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

  global.RMPanel = { build, buildDetailModal, shortlistSection };
})(typeof window !== "undefined" ? window : this);
