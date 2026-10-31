/* productpage.js — the panel shown on a Shopee PRODUCT page (/product/<shop>/<item>).
 *
 * Rebuilt 2026-10-19 (v0.9.25) from a data-analyst brief: the page must answer,
 * in this order,
 *   1. Should I advertise this, and what is the most I may pay per Meta click?
 *   2. How sure is that answer (range + probability), and what evidence is it from?
 *   3. What could make it fail (zero-converter, thin trust, leaking clicks)?
 *   4. Have I already run it before?
 * then the content tools.
 *
 * THE MONEY MATH (all from the imported performance snapshot):
 *   EPC        = commission per SHOPEE click (Empirical Bayes posterior, epc.js)
 *   arrival    = Shopee clicks per META click (same clean days, both sides)
 *   value/click= EPC x arrival  -> what one Meta click is worth
 *   ROAS       = value/click / Meta CPC   (reproduces each tag's real ROAS:
 *                polkadotIphone 2.42 vs 2.39 measured, global 1.26 vs 1.28)
 * The old modal compared EPC (per Shopee click) to a configured CPC (per Meta
 * click) — a unit mismatch that undervalued every product by ~1.5x.
 *
 * Dropped from the old modal because they were always '?' or wrong on this page:
 * Stok, Umur listing, Lokasi toko, Official (hard-coded "Tidak"). The weighted
 * PRO score moves into a collapsed block — it is not a prediction.
 *
 * Pure decision math lives in decide(); it has no DOM access and is unit-tested
 * in test/e2e-productpage.js.
 */
(function (global) {
  "use strict";

  const MIN_TAG_META_CLICKS = 100;  // below this a tag's own CPC is noise
  const TEST_BUDGET = 30000;        // FARDU KIFAYAH: lifetime net <= -30rb = WAJIB MATIKAN
  const STALE_DAYS = 3;

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }
  function n(v) {
    if (v == null || v === "") return null;   // Number(null) is 0 — never let missing read as zero
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }
  function fmt(v) { return v == null ? "?" : Math.round(v).toLocaleString("id-ID"); }
  function rp(v) { return v == null ? "?" : "Rp" + fmt(v); }
  function x2(v) { return v == null ? "?" : v.toFixed(2) + "x"; }
  function pct(v) { return v == null ? "?" : Math.round(v * 100) + "%"; }
  function nicheLabel(k) {
    return (global.RMNiche && global.RMNiche.LABEL && global.RMNiche.LABEL[k]) || k || "?";
  }

  function normCdf(z) {
    if (global.RMEpc && global.RMEpc.normCdf) return global.RMEpc.normCdf(z);
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  /* Base rate: of every tag that actually got ad spend, how many paid back? */
  function baseRate(snapshot, be) {
    const tags = Object.values((snapshot && snapshot.tags) || {})
      .filter((t) => n(t.spend) > 0 && n(t.roas) != null);
    if (!tags.length) return null;
    // snapshot ROAS is GROSS (commission/spend): paid back = above the
    // after-tax break-even (1.14 by default), not above 1.0 (v0.9.31)
    const win = tags.filter((t) => t.roas >= (be || 1)).length;
    return { tested: tags.length, paidBack: win, rate: win / tags.length };
  }

  function topWinners(snapshot, k) {
    return Object.entries((snapshot && snapshot.tags) || {})
      .filter(([, t]) => t.trusted && n(t.spend) >= 100000 && n(t.roas) != null)
      .sort((a, b) => b[1].roas - a[1].roas).slice(0, k || 3)
      .map(([tag, t]) => ({ tag, roas: t.roas }));
  }

  /* decide(): every number the panel shows. No DOM.
   *   pred     - RMEpc.predict() output (or null when no snapshot)
   *   snapshot - imported performance snapshot (or null)
   *   tag      - matched tag name (or null)
   *   cfg      - plugin config (breakEvenCPC fallback)
   *   now      - Date (injectable for tests)                                  */
  function decide(pred, snapshot, tag, cfg, now) {
    const out = { ready: false, reasons: [], risks: [] };
    if (!pred || !snapshot || !snapshot.global) {
      out.action = "IMPOR DATA";
      out.cls = "rm-grey";
      out.reasons.push("Belum ada snapshot performa. Admin Panel → Feedback Loop → impor performance-snapshot.json.");
      return out;
    }
    const g = snapshot.global;
    const t = (tag && snapshot.tags && snapshot.tags[tag]) || null;
    const basis = pred.basis === "tag" && t ? "tag" : pred.basis === "niche" ? "niche" : "global";
    const nz = pred.niche && snapshot.niches ? snapshot.niches[pred.niche] : null;
    const nzModel = pred.nicheWin || null;

    // arrival + CPC + ROAS: one shared function (epc.js) so the product page and
    // the Thompson test plan can never disagree. Order: tag -> niche -> global.
    const ec = global.RMEpc.roasPrior(
      Object.assign({}, pred, { basis, tag: basis === "tag" ? tag : null }), snapshot, cfg);
    const { arrival, arrivalSrc, cpc, cpcSrc, value, valueLow, valueHigh } = ec;
    Object.assign(out, {
      ready: true, basis, tag: basis === "tag" ? tag : null, tagStats: t,
      niche: pred.niche || null, nicheStats: nz, nicheWin: nzModel,
      arrival, arrivalSrc, cpc, cpcSrc,
      epc: pred.epc, value, valueLow, valueHigh,
      maxCpc: ec.maxCpc,                   // break-even Meta CPC AFTER tax (v0.9.31)
      breakEvenGross: ec.breakEvenGross,   // gross tag ROAS needed to break even
      confidence: pred.confidence, zeroConverter: !!pred.zeroConverter,
      roas: ec.roas, roasLow: ec.roasLow, roasHigh: ec.roasHigh,
      pProfit: ec.pProfit,
      base: baseRate(snapshot, ec.breakEvenGross),
      winners: topWinners(snapshot, 3),
      testBudget: TEST_BUDGET
    });

    // snapshot freshness
    const gen = Date.parse(snapshot.generatedAt || "");
    if (Number.isFinite(gen)) {
      out.ageDays = Math.floor(((now || new Date()).getTime() - gen) / 86400000);
      if (out.ageDays > STALE_DAYS) out.risks.push(
        `Snapshot sudah ${out.ageDays} hari. Jalankan "oke gas", lalu impor ulang supaya prediksinya pakai data terbaru.`);
    }

    // verdict
    if (out.zeroConverter) {
      out.action = "LEWATI"; out.cls = "rm-red";
      out.reasons.push(`Tag mirip "${tag}" sudah dapat klik tapi 0 order.`);
    } else if (basis === "niche" && out.nicheWin && out.nicheWin.tested >= 5 && out.nicheWin.winRate < 0.10) {
      // A whole family that has (almost) never paid back is evidence, not noise.
      out.action = "HATI-HATI"; out.cls = "rm-yellow";
      out.reasons.push(`Belum ada riwayat iklan untuk produk ini, dan niche "${nicheLabel(out.niche)}" ` +
        `baru ${out.nicheWin.paidBack} dari ${out.nicheWin.tested} produk yang balik modal.`);
      out.reasons.push("Kalau tetap mau coba, pakai budget uji kecil.");
    } else if (basis === "niche" || basis === "global") {
      out.action = "UJI KECIL"; out.cls = "rm-yellow";
      if (basis === "niche" && out.nicheWin) {
        out.reasons.push(`Belum ada riwayat iklan untuk produk ini. Angkanya rata-rata niche "${nicheLabel(out.niche)}", bukan prediksi khusus produk ini.`);
        out.reasons.push(`Peluang balik modal produk baru di niche ini: ~${pct(out.nicheWin.winRate)} ` +
          `(${out.nicheWin.paidBack} dari ${out.nicheWin.tested} yang pernah diuji).`);
      } else {
        out.reasons.push("Belum ada riwayat iklan untuk produk ini. Angkanya rata-rata semua campaign kamu, bukan prediksi untuk produk ini.");
        if (out.base) out.reasons.push(
          `Dari ${out.base.tested} produk yang pernah diiklankan, ${out.base.paidBack} (${pct(out.base.rate)}) balik modal.`);
      }
    } else if (out.roasLow != null && out.roasLow >= 1) {
      out.action = "IKLANKAN"; out.cls = "rm-green";
      out.reasons.push("Batas bawah prediksi ROAS di atas 1x.");
    } else if (out.roas != null && out.roas >= 1) {
      out.action = "LAYAK COBA"; out.cls = "rm-green";
      out.reasons.push("Prediksi ROAS di atas 1x, tapi batas bawahnya masih di bawah 1x.");
    } else if (out.roas != null && out.roas >= 0.7) {
      out.action = "HATI-HATI"; out.cls = "rm-yellow";
      out.reasons.push("Prediksi ROAS di bawah 1x. Hanya untung kalau CPC turun.");
    } else {
      out.action = "LEWATI"; out.cls = "rm-red";
      out.reasons.push("Prediksi ROAS jauh di bawah 1x.");
    }

    // risks from the evidence itself
    if (basis === "tag" && t) {
      if (n(t.arrival) != null && t.arrival < 1 && n(t.days) >= 3)
        out.risks.push(`Arrival tag ini ${t.arrival.toFixed(2)} (klik Shopee < klik Meta). Cek link/tag.`);
      if (t.verdict === "zero-converter")
        out.risks.push(`Tag "${tag}" dapat klik tapi 0 order.`);
      else if (n(t.roas) != null && t.roas < (out.breakEvenGross || 1))
        out.risks.push(`Riwayat tag "${tag}" rugi setelah pajak: ROAS kotor ${x2(n(t.roas))} (impas ${x2(out.breakEvenGross || 1)}), ` +
          `net bersih ${rp(n(t.commission) * (1 - (ec.wht || 0)) - n(t.spend) * (1 + (ec.vat || 0)))}.`);
      if (n(t.clicks) < 3 * (pred.kEff || 30))
        out.risks.push("Riwayat tag masih tipis, prediksi ditarik ke rata-rata global.");
    }
    return out;
  }

  /* The one chart that carries the decision: what a Meta click is worth (range
   * + point) against what a Meta click costs. Left of the line = loss. */
  function valueChart(d) {
    if (!d.ready) return "";
    const W = 600, H = 92, L = 14, R = 14;
    const max = Math.max(d.valueHigh, (d.cpc || 0) * 1.6, 1) * 1.1;
    const X = (v) => L + (Math.max(0, v) / max) * (W - L - R);
    const yBar = 34;
    const col = d.cls === "rm-green" ? "#06a94d" : d.cls === "rm-red" ? "#c0392b" : "#e0a800";
    let s = `<svg class="rm-pp-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
      `aria-label="Nilai per klik Meta ${rp(d.value)} (rentang ${rp(d.valueLow)} sampai ${rp(d.valueHigh)}), CPC ${rp(d.cpc)}">`;
    // loss zone
    if (d.cpc) s += `<rect x="${L}" y="${yBar - 14}" width="${X(d.cpc) - L}" height="28" fill="#fdecea"/>`;
    s += `<line x1="${L}" y1="${yBar}" x2="${W - R}" y2="${yBar}" stroke="#ddd" stroke-width="2"/>`;
    // 80% band + point
    s += `<rect x="${X(d.valueLow)}" y="${yBar - 7}" width="${Math.max(2, X(d.valueHigh) - X(d.valueLow))}" height="14" rx="7" fill="${col}" opacity=".35"/>`;
    s += `<circle cx="${X(d.value)}" cy="${yBar}" r="7" fill="${col}"/>`;
    s += `<text x="${X(d.value)}" y="${yBar - 14}" font-size="12" font-weight="700" text-anchor="middle" fill="#222">${rp(d.value)}</text>`;
    if (d.cpc) {
      s += `<line x1="${X(d.cpc)}" y1="${yBar - 20}" x2="${X(d.cpc)}" y2="${yBar + 20}" stroke="#222" stroke-width="2" stroke-dasharray="4 3"/>`;
      s += `<text x="${X(d.cpc)}" y="${yBar + 34}" font-size="11" text-anchor="middle" fill="#222">CPC ${rp(d.cpc)}</text>`;
    }
    s += `<text x="${L}" y="${H - 4}" font-size="10" fill="#999">Rp0</text>`;
    s += `<text x="${W - R}" y="${H - 4}" font-size="10" text-anchor="end" fill="#999">${rp(max)}</text>`;
    s += `</svg>`;
    return `<div class="rm-pp-chart"><div class="rm-pp-chart-t">Nilai 1 klik Meta vs biaya 1 klik Meta ` +
      `<span>(titik = prediksi, pita = rentang 80%, area merah = rugi)</span></div>${s}</div>`;
  }

  /* Benchmark: this prediction next to break-even, your average and your best. */
  function benchChart(d) {
    if (!d.ready || d.roas == null) return "";
    const rows = [{ label: "Produk ini (prediksi)", v: d.roas, col: d.cls === "rm-green" ? "#06a94d" : d.cls === "rm-red" ? "#c0392b" : "#e0a800", bold: true }];
    if (d.tag && d.tagStats && n(d.tagStats.roas) != null)
      rows.push({ label: `Riwayat tag "${d.tag}"`, v: d.tagStats.roas, col: "#8e7cc3" });
    rows.push({ label: "Balik modal", v: 1, col: "#999" });
    (d.winners || []).filter((w) => w.tag !== d.tag)
      .forEach((w) => rows.push({ label: "Winner: " + w.tag, v: w.roas, col: "#9fd3b0" }));
    const max = Math.max(1.5, ...rows.map((r) => r.v || 0));
    return `<div class="rm-pp-chart"><div class="rm-pp-chart-t">ROAS dibanding patokan</div>` +
      rows.map((r) => `<div class="rm-pp-bar${r.bold ? " rm-pp-bar-me" : ""}">` +
        `<span class="rm-pp-bar-l" title="${esc(r.label)}">${esc(r.label)}</span>` +
        `<span class="rm-pp-bar-t"><span style="width:${Math.round((r.v || 0) / max * 100)}%;background:${r.col}"></span></span>` +
        `<span class="rm-pp-bar-v">${x2(r.v)}</span></div>`).join("") + `</div>`;
  }

  function kv(label, value, title) {
    return `<div class="rm-pp-kv"${title ? ` title="${esc(title)}"` : ""}><span>${esc(label)}</span><b>${value}</b></div>`;
  }

  function starMini(breakdown, total) {
    if (!breakdown || !breakdown.length || !total) return "";
    let h = "";
    for (let s = 5; s >= 1; s--) {
      const c = breakdown[s - 1] || 0;
      const p = Math.round(c / total * 100);
      h += `<div class="rm-pp-star"><span>${s}★</span><span class="rm-pp-bar-t"><span style="width:${p}%"></span></span><span>${p}%</span></div>`;
    }
    return `<div class="rm-pp-stars">${h}</div>`;
  }

  function build(product, detail, pro, pred, cfg) {
    const p = product || {}, dt = detail || {};
    const snap = (cfg && cfg.__perf) || null;
    const d = decide(pred, snap, p.suggestedTag || null, cfg || {});
    const ec = (pro && pro.economics) || {};
    const total = n(dt.totalReviews);
    const pos = dt.starBreakdown && total
      ? ((dt.starBreakdown[3] || 0) + (dt.starBreakdown[4] || 0)) / total : null;
    const risks = d.risks.slice();
    if (total != null && total < 30) risks.push(`Baru ${fmt(total)} review. Bukti sosial tipis, konversi bisa di bawah rata-rata.`);
    if (n(dt.rating) != null && dt.rating < 4.6) risks.push(`Rating ${dt.rating}, di bawah 4.6.`);
    (pro && pro.gates || []).forEach((gt) => { if (!/0 ORDER/.test(gt)) risks.push(gt); });

    const t = d.tagStats;
    const evidence = !d.ready ? "" : (d.basis === "tag"
      ? kv("Tag acuan", esc(d.tag)) +
        (d.niche ? kv("Niche", esc(nicheLabel(d.niche))) : "") +
        kv("Hari ada data", `${fmt(n(t.days))} (${esc(t.firstDate || "?")} → ${esc(t.lastDate || "?")})`) +
        kv("Klik Shopee", fmt(n(t.clicks))) + kv("Order", fmt(n(t.orders))) +
        kv("Konversi", t.conversionRate != null ? t.conversionRate + "%" : "?") +
        kv("EPC nyata → prediksi", `${rp(n(t.epc))} → ${rp(d.epc)}`,
           "Prediksi ditarik ke rata-rata global sesuai jumlah klik (Empirical Bayes)") +
        kv("Arrival", `${d.arrival.toFixed(2)} (${esc(d.arrivalSrc)})`, "Klik Shopee per klik Meta") +
        kv("CPC Meta", `${rp(d.cpc)} (${esc(d.cpcSrc)})`) +
        kv("ROAS nyata", x2(n(t.roas))) + kv("Net tag", rp(n(t.commission) - n(t.spend)))
      : (d.basis === "niche"
          ? kv("Dasar", `rata-rata niche "${esc(nicheLabel(d.niche))}" (produk baru)`) +
            kv("Niche dari", p.nicheSource === "kategori" ? `kategori Shopee: ${esc(p.categoryL1 || "?")}`
              : p.nicheSource === "nama" ? "kata di nama produk" : "tidak dikenali → Lainnya") +
            kv("EPC niche", rp(d.epc)) +
            kv("Arrival", `${d.arrival.toFixed(2)} (${esc(d.arrivalSrc)})`, "Klik Shopee per klik Meta") +
            kv("CPC Meta", `${rp(d.cpc)} (${esc(d.cpcSrc)})`) +
            (d.nicheWin ? kv("Peluang balik modal niche",
              `~${pct(d.nicheWin.winRate)} (${d.nicheWin.paidBack}/${d.nicheWin.tested} diuji)`,
              `Rentang 80%: ${pct(d.nicheWin.winLow)}–${pct(d.nicheWin.winHigh)}. Hanya tag dengan spend ≥ Rp10rb yang dihitung sebagai uji.`) : "") +
            (d.nicheStats && n(d.nicheStats.roas) != null ? kv("ROAS niche (semua tag)", x2(n(d.nicheStats.roas))) : "")
          : kv("Dasar", "rata-rata semua campaign (produk baru)") +
        kv("EPC global", rp(d.epc)) +
        kv("Arrival global", `${d.arrival.toFixed(2)}`, "Klik Shopee per klik Meta") +
        kv("CPC rata-rata", `${rp(d.cpc)} (${esc(d.cpcSrc)})`) +
        (d.base ? kv("Peluang dasar balik modal", `${pct(d.base.rate)} (${d.base.paidBack}/${d.base.tested} produk)`) : "")));

    const headline = !d.ready ? "" :
      `<div class="rm-pp-nums">` +
      `<div><span>Prediksi ROAS bersih</span><b>${x2(d.roas)}</b><i>${x2(d.roasLow)} – ${x2(d.roasHigh)} · setelah PPN &amp; WHT</i></div>` +
      `<div><span>P(untung)</span><b>${d.pProfit == null ? "?" : d.pProfit >= 0.99 ? "≥99%" : d.pProfit <= 0.01 ? "≤1%" : pct(d.pProfit)}</b><i>keyakinan ${esc(d.confidence)}</i></div>` +
      `<div><span>Max CPC Meta</span><b>${rp(d.maxCpc)}</b><i>di atas ini rugi (sudah hitung pajak)</i></div>` +
      `<div><span>Budget uji</span><b>maks ${rp(d.testBudget)}</b><i>net −30rb = wajib matikan</i></div>` +
      `</div>`;

    const hot = d.cls === "rm-green";
    const root = document.createElement("div");
    root.className = "rm-modal-bg rm-pp-root";
    root.innerHTML =
      `<div class="rm-modal rm-pp${hot ? " rm-modal-hot" : ""}">` +
      `<div class="rm-modal-head"><b>📊 ${esc(dt.name || p.name || "Produk")}</b>` +
      `<button class="rm-pp-min" title="Ciutkan / buka panel">–</button>` +
      `<button class="rm-modal-x" title="Tutup">✕</button></div>` +
      `<div class="rm-modal-body">` +
      `<div class="rm-pp-verdict ${d.cls}"><span class="rm-pp-action">${esc(d.action)}</span>` +
      `<span class="rm-pp-why">${d.reasons.map(esc).join(" ")}</span></div>` +
      headline +
      `<div class="rm-pp-grid">${valueChart(d)}${benchChart(d)}</div>` +
      (risks.length ? `<div class="rm-pp-risks"><b>⚠ Risiko</b><ul>${risks.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : "") +
      `<div class="rm-pp-cols">` +
      (evidence ? `<div class="rm-pp-box"><div class="rm-pp-box-t">Dasar data</div>${evidence}</div>` : "") +
      `<div class="rm-pp-box"><div class="rm-pp-box-t">Kepercayaan pembeli</div>` +
      kv("Rating", n(dt.rating) != null ? "⭐ " + dt.rating : "?") +
      kv("Review", fmt(total)) +
      kv("Review 4–5★", pos != null ? pct(pos) : "?") +
      kv("Terjual (total)", fmt(n(dt.historicalSold))) +
      kv("Favorit", fmt(n(dt.likedCount))) +
      kv("Komisi", ec.commissionPct != null ? ec.commissionPct + "%" : "?") +
      starMini(dt.starBreakdown, total) + `</div>` +
      `</div>` +
      `<div class="rm-pp-box rm-pp-hist"><div class="rm-pp-box-t">Riwayat eksperimen produk ini</div>` +
      `<div class="rm-pp-hist-body rm-sub">memuat…</div></div>` +
      `<div class="rm-exp"><b>Campaign Meta = Tag Shopee</b><span>Generate caption/video untuk membuat ID otomatis.</span></div>` +
      `<div class="rm-foot rm-pp-foot">` +
      `<div class="rm-pp-group"><span>Bikin konten</span>` +
      `<button class="rm-launch" data-id="${esc(p.id)}" title="Nama campaign + short-link + caption + prompt video + checklist, sekaligus">🚀 Launch pack</button>` +
      `<button class="rm-ai2" data-id="${esc(p.id)}">✨ Caption</button>` +
      `<button class="rm-vprompt" data-id="${esc(p.id)}">🎬 Prompt Video</button>` +
      (global.RMGahwa ? `<button class="rm-gahwa" data-id="${esc(p.id)}" title="Unduh semua gambar, video & teks produk ini untuk engine Gahwa">🎞 Gahwa Pack</button>` : "") +
      (global.RMVideo && global.RMVideo.hasVideo() ? `<button class="rm-video" data-id="${esc(p.id)}">⬇ Video</button>` : "") +
      `</div>` +
      `<div class="rm-pp-group"><span>Lainnya</span>` +
      `<button class="rm-exp-new" data-id="${esc(p.id)}" title="Buat ID baru dan rotasi ke konsep berikutnya">＋ Eksperimen Baru</button>` +
      `<button class="rm-star2" data-id="${esc(p.id)}">⭐ Simpan</button>` +
      `<button class="rm-capture" data-id="${esc(p.id)}" title="Data produk ini sudah dikumpulkan otomatis. Klik untuk menyegarkan/memastikan tersimpan.">💾 Refresh Data Training</button>` +
      `</div></div>` +
      `<div class="rm-out" style="display:none"></div>` +
      (pro ? `<details class="rm-pp-legacy"><summary>Skor PRO lama (bobot manual, bukan prediksi): ${esc(pro.pro)} ${esc(pro.action)}</summary>` +
        `<div class="rm-pillars">` + Object.entries(pro.pillars || {}).map(([k, v]) =>
          `<div class="rm-pillar"><span>${esc(k)}</span><div class="rm-star-track"><div class="rm-star-fill" style="width:${Number(v) || 0}%"></div></div><span>${esc(v)}</span></div>`).join("") +
        `</div></details>` : "") +
      `<div class="rm-pp-src">` +
      (snap ? `Snapshot ${esc(String(snap.generatedAt || "").slice(0, 10))} · ${Object.keys(snap.tags || {}).length} tag` : "Tanpa snapshot") +
      ` · Harga hanya untuk analisa, jangan dipakai di iklan.</div>` +
      `</div></div>`;

    const min = root.querySelector(".rm-pp-min");
    if (min) min.addEventListener("click", () => {
      const collapsed = root.classList.toggle("rm-pp-collapsed");
      min.textContent = collapsed ? "+" : "–";
      try { localStorage.setItem("rm_pp_collapsed", collapsed ? "1" : "0"); } catch (_) {}
    });
    try {
      if (localStorage.getItem("rm_pp_collapsed") === "1") {
        root.classList.add("rm-pp-collapsed"); if (min) min.textContent = "+";
      }
    } catch (_) {}
    root.__rmDecision = d;
    return root;
  }

  /* Past experiment IDs issued for this product on this browser, with their
   * snapshot result when that ID has reached the snapshot. */
  async function fillHistory(root, product, snapshot) {
    const host = root && root.querySelector(".rm-pp-hist-body");
    if (!host) return;
    let rows = [];
    try {
      if (global.RMExperiment && global.RMExperiment.all) rows = await global.RMExperiment.all();
    } catch (_) { rows = []; }
    const p = product || {};
    const mine = (rows || []).filter((r) => r &&
      ((p.id && r.productId === p.id) || (p.href && r.productUrl === p.href)));
    if (!mine.length) { host.textContent = "Belum pernah dibuat eksperimen untuk produk ini di browser ini."; return; }
    const tags = (snapshot && snapshot.tags) || {};
    host.classList.remove("rm-sub");
    host.innerHTML = `<table class="rm-pp-tbl"><thead><tr><th>Tanggal</th><th>ID (campaign = tag)</th><th>Konsep</th><th>Hasil</th></tr></thead><tbody>` +
      mine.slice(-8).reverse().map((r) => {
        const s = tags[r.campaignTag];
        const res = s ? `ROAS ${x2(n(s.roas))} · ${fmt(n(s.orders))} order` : "belum ada di snapshot";
        const day = r.ts ? new Date(r.ts).toISOString().slice(0, 10) : esc(r.day || "?");
        return `<tr><td>${day}</td><td><code>${esc(r.campaignTag)}</code></td><td>${esc(r.concept || "–")}</td><td>${res}</td></tr>`;
      }).join("") + `</tbody></table>`;
  }

  global.RMProductPage = { build, decide, fillHistory, baseRate };
})(typeof window !== "undefined" ? window : this);
