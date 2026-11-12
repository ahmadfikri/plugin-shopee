/* fbadlib.js — Facebook Ad Library video downloader core (v0.9.29).
 *
 * How it works (verified against facebook.com/ads/library, 30 Oct 2026, no login):
 *   1. Every ad is a JSON node {ad_archive_id, page_name, snapshot:{...}}.
 *      The first ~30 ads are inline in <script type="application/json">;
 *      ads loaded while scrolling arrive in /api/graphql responses
 *      (captured by fbadlib-hook.js in the page's MAIN world).
 *   2. snapshot.videos[] (and snapshot.cards[] for carousel/DCO ads) carry
 *      video_hd_url (576p-720p) and video_sd_url (360p). The on-page player
 *      uses the SD file, so grabbing <video src> would only give 360p.
 *   3. The fbcdn URLs are pre-signed: no cookie or Referer needed.
 * Shared by the content script and node tests. */
(function (global) {
  "use strict";

  const LIB_URL_RE = /^https:\/\/(?:www\.|web\.|m\.)?facebook\.com\/ads\/library/i;
  // Card label differs by UI language: "ID Galeri: 123" (id), "Library ID: 123" (en).
  const CARD_ID_RE = /(?:ID Galeri|Library ID|ID Pustaka|ID Perpustakaan)\s*:\s*(\d{6,25})/i;

  function isLibraryUrl(u) { return LIB_URL_RE.test(String(u || "")); }

  // GraphQL bodies may start with "for (;;);" and may hold several JSON docs,
  // one per line (streamed responses). Returns parsed documents.
  function parseDocs(text) {
    const s = String(text || "").replace(/^\s*for\s*\(;;\);/, "");
    try { return [JSON.parse(s)]; } catch (_) {}
    const out = [];
    for (const line of s.split("\n")) {
      const t = line.trim();
      if (!t || (t[0] !== "{" && t[0] !== "[")) continue;
      try { out.push(JSON.parse(t)); } catch (_) {}
    }
    return out;
  }

  function videosOf(snap) {
    const vids = [];
    const push = (v) => {
      if (!v) return;
      const hd = v.video_hd_url || "", sd = v.video_sd_url || "";
      if (!hd && !sd) return;
      if (vids.some((x) => (x.hd || x.sd) === (hd || sd))) return;
      vids.push({ hd, sd, preview: v.video_preview_image_url || "" });
    };
    (snap.videos || []).forEach(push);
    (snap.cards || []).forEach(push);
    return vids;
  }

  function bodyText(snap) {
    const b = snap.body;
    if (!b) return "";
    if (typeof b === "string") return b;
    return b.text || (b.markup && b.markup.__html) || "";
  }

  // Walk any JSON value and collect ad nodes. Iterative: FB payloads are deep.
  function extractAds(root) {
    const ads = [];
    const stack = [root];
    const seen = new Set();
    while (stack.length) {
      const o = stack.pop();
      if (!o || typeof o !== "object") continue;
      if (Array.isArray(o)) { for (let i = o.length - 1; i >= 0; i--) stack.push(o[i]); continue; }
      if (o.ad_archive_id && o.snapshot && typeof o.snapshot === "object") {
        const id = String(o.ad_archive_id);
        if (!seen.has(id)) {
          seen.add(id);
          const s = o.snapshot;
          // end_date = last day the ad was seen running (today for active ads).
          const endTs = o.end_date || (o.is_active !== false ? Date.now() / 1000 : 0);
          const days = o.start_date && endTs ? Math.max(1, Math.round((endTs - o.start_date) / 86400) + 1) : 0;
          ads.push({
            days,
            variants: Math.max(1, Number(o.collation_count) || 1),
            platforms: o.publisher_platform || [],
            id,
            pageId: String(o.page_id || s.page_id || ""),
            pageName: s.page_name || o.page_name || "",
            startDate: o.start_date ? new Date(o.start_date * 1000).toISOString().slice(0, 10) : "",
            active: o.is_active !== false,
            format: s.display_format || "",
            body: bodyText(s),
            linkUrl: s.link_url || "",
            cta: s.cta_text || "",
            videos: videosOf(s),
          });
        }
        continue; // an ad node never nests another ad
      }
      for (const k in o) { const v = o[k]; if (v && typeof v === "object") stack.push(v); }
    }
    return ads;
  }

  function extractFromText(text) {
    const ads = [];
    for (const d of parseDocs(text)) ads.push(...extractAds(d));
    return ads;
  }

  function slug(s, max) {
    return String(s || "").normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, max || 40) || "fbad";
  }

  // fbads/<page>/<page>_<adId>[_<n>]_<hd|sd>.mp4
  function filename(ad, idx, quality) {
    const page = slug(ad.pageName || ad.pageId);
    const n = ad.videos.length > 1 ? "_" + (idx + 1) : "";
    return "fbads/" + page + "/" + page + "_" + ad.id + n + "_" + quality + ".mp4";
  }

  // [{url, fallback, filename}] — HD first, SD as fallback.
  function downloadsFor(ad) {
    return ad.videos.map((v, i) => ({
      url: v.hd || v.sd,
      fallback: v.hd && v.sd ? v.sd : "",
      filename: filename(ad, i, v.hd ? "hd" : "sd"),
      fallbackFilename: filename(ad, i, "sd"),
    }));
  }

  /* Winner signal (v0.9.30). Nobody pays for a losing ad for weeks, so days
   * running is the strongest public proxy for profit. Many variations of the
   * same creative (collation_count) means the advertiser is scaling it.
   * Thresholds: >=14 days TERBUKTI, 7-13 MENJANJIKAN, <7 BARU. */
  function signal(ad) {
    const d = ad.days || 0, v = ad.variants || 1;
    const tier = d >= 14 ? "TERBUKTI" : d >= 7 ? "MENJANJIKAN" : "BARU";
    const scaling = v >= 3;
    const score = Math.round(d * (1 + Math.min(v - 1, 9) * 0.25));
    const label = (tier === "TERBUKTI" ? "🏆 " : tier === "MENJANJIKAN" ? "📈 " : "🆕 ") +
      d + " hari" + (v > 1 ? " · " + v + " variasi" : "") + (scaling ? " · SCALING" : "");
    return { tier, scaling, score, label };
  }

  function rank(list) {
    return list.slice().sort((a, b) => signal(b).score - signal(a).score || b.days - a.days);
  }

  /* ---- competitor tracker (v0.9.31) ----------------------------------
   * prev = stored {adId: {firstSeen, lastSeen, days, page, body, link}} for ONE
   * advertiser page. cur = ads captured now. Returns the updated store plus
   * what changed since the last visit. An ad that is no longer shown on an
   * "active only" page is NOT proof it died (the user may not have scrolled to
   * the end), so it is "hilang" until the user confirms by scrolling fully. */
  function trackDiff(prev, cur, todayIso) {
    const store = Object.assign({}, prev || {});
    const seenNow = new Set();
    const baru = [], lanjut = [];
    for (const ad of cur) {
      seenNow.add(ad.id);
      const old = store[ad.id];
      if (!old) baru.push(ad.id); else lanjut.push(ad.id);
      store[ad.id] = { firstSeen: old ? old.firstSeen : todayIso, lastSeen: todayIso, days: ad.days,
        page: ad.pageName, body: String(ad.body || "").slice(0, 160), link: shopeeLink(ad), gone: false };
    }
    const hilang = [];
    for (const id of Object.keys(store)) {
      if (seenNow.has(id)) continue;
      if (!store[id].gone) { store[id] = Object.assign({}, store[id], { gone: true, goneSince: todayIso }); }
      hilang.push(id);
    }
    return { store, baru, lanjut, hilang, firstVisit: !prev || !Object.keys(prev).length };
  }

  function shopeeLink(ad) {
    const m = (String(ad.linkUrl || "") + " " + String(ad.body || ""))
      .match(/https?:\/\/(?:s\.shopee\.co\.id|shopee\.co\.id)\/[^\s"'<>]+/i);
    return m ? m[0].replace(/[),.]+$/, "") : "";
  }

  /* ---- creative brief (v0.9.31) ---------------------------------------
   * Fikri's rules: never mention price; original creative (study the angle,
   * do not copy sentences or re-use the video); ~10 s video; one click CTA. */
  function sanitizeBody(t) {
    return String(t || "")
      .replace(/https?:\/\/\S+/g, "[link]")
      .replace(/#[\p{L}\p{N}_]+/gu, "")   // competitor hashtags (e.g. #PromoHariIni) add no angle
      .replace(/Rp\s?[\d.,]+(?:\s?(rb|ribu|k|jt|juta))?/gi, "")
      .replace(/\b\d{1,3}(?:[.,]\d{3})+\b/g, "")
      .replace(/\b(harga|murah|termurah|diskon|promo|potongan|hemat|cashback|gratis ongkir|terjangkau)\b/gi, "")
      .replace(/[ \t]{2,}/g, " ").trim().slice(0, 1200);
  }

  function briefPrompt(ad) {
    const sg = signal(ad);
    return [
      "Kamu creative strategist iklan Meta untuk affiliate Shopee Indonesia.",
      `Di bawah ini teks iklan KOMPETITOR yang sudah tayang ${ad.days} hari` +
        (ad.variants > 1 ? ` dengan ${ad.variants} variasi` : "") + ` (sinyal: ${sg.tier}). Iklan yang jalan selama ini kemungkinan besar untung.`,
      "",
      "TEKS IKLAN KOMPETITOR:",
      '"""', sanitizeBody(ad.body) || "(tanpa teks)", '"""',
      "",
      "Tugas: buat BRIEF KREATIF ORIGINAL untuk produk yang sama. Pelajari ANGLE-nya, jangan salin kalimatnya.",
      "Format jawaban (Bahasa Indonesia, ringkas, tanpa markdown tebal):",
      "1. ANGLE: kenapa iklan ini kemungkinan berhasil (masalah yang dipukul, emosi, bukti), maks 3 poin.",
      "2. HOOK: 3 pilihan kalimat pembuka 0-2 detik, masing-masing beda pendekatan (masalah / kejutan visual / pertanyaan).",
      "3. NASKAH 10 DETIK: voice-over + teks layar per detik (0-2, 2-5, 5-8, 8-10). Bisa dibaca tanpa suara.",
      "4. SHOT LIST: 4-5 shot, gaya UGC asli (tangan/HP), bukan render mewah.",
      "5. CTA: satu ajakan klik ke link (contoh: \"cek link di bawah\").",
      "",
      "LARANGAN (wajib): JANGAN sebut harga, Rp, diskon, promo, murah, terjangkau, atau perbandingan harga di bagian mana pun.",
      "JANGAN klaim palsu (nomor 1, dijamin, original kalau tidak tertulis). Jangan pakai ulang video kompetitor.",
    ].join("\n");
  }

  // Safety net on the model output: drop any line that still talks price.
  function cleanBrief(text) {
    return String(text || "").split("\n")
      .filter((l) => !/Rp\s?\d|\bharga\b|\bmurah\b|\bdiskon\b|\bpromo\b|\bterjangkau\b/i.test(l))
      .join("\n").replace(/\*\*/g, "").trim();
  }

  function cardIdFromText(t) { const m = CARD_ID_RE.exec(String(t || "")); return m ? m[1] : null; }
  function countCardIds(t) { const m = String(t || "").match(new RegExp(CARD_ID_RE.source, "gi")); return m ? m.length : 0; }

  /* ---- niche + "pola champion" score (v0.9.34, Fikri 12 Nov 2026) ----
   * Baseline = Fikri's own data, 43 campaigns with spend >= Rp60rb:
   *  - all 8 champions (ROAS >= 1,4) were casing HP or rumah/dapur;
   *    fashion/kecantikan tests failed (shellaSaukia, niigelFlatshoes:
   *    komisi/order ~Rp1.350) -> niche is the strongest signal visible here.
   *  - hook rate does NOT separate winners (rank corr -0,12), so it is NOT
   *    used. CPR and order-per-click separate them best, but those only exist
   *    after OUR ad runs, so they cannot be scored from the Ad Library.
   * Public proxies used instead: days running (nobody pays weeks for a loser),
   * variations (advertiser is scaling it), and how many DIFFERENT advertisers
   * push the same Shopee link (independent validation).
   * This is a shortlist filter, not a prediction. 7-day test + twin date decide. */
  const NICHES = [
    ["hp", "Casing HP", /\b(case|casing|kesing|softcase|hardcase|iphone|samsung|xiaomi|redmi|oppo|vivo|realme|infinix|magsafe|tempered|anti ?gores|pelindung layar|lanyard|popsocket|holder hp)\b/i],
    ["rumah", "Rumah/Dapur", /\b(dapur|rak|wadah|toples|kulkas|tumbler|botol|termos|mug|gelas|piring|mangkok|panci|wajan|spatula|talenan|organizer|keranjang|lemari|gantungan|alat pel|pel|sapu|kamar mandi|wastafel|rice cooker|blender|food container|lunch ?box|kotak makan|penyimpanan|storage|sendok|teflon)\b/i],
    ["gadget", "Gadget", /\b(earphone|tws|headset|earbuds?|powerbank|power bank|charger|kabel data|speaker|smartwatch|kipas|lampu|mouse|keyboard|webcam)\b/i],
    ["fashion", "Fashion", /\b(gamis|hijab|jilbab|khimar|baju|kaos|kemeja|celana|dress|rok|sepatu|sandal|sneakers|tas|dompet|jaket|hoodie|mukena|flatshoes|heels)\b/i],
    ["beauty", "Kecantikan", /\b(skincare|serum|parfum|perfume|lipstik|lip tint|masker|sunscreen|toner|bedak|cushion|body mist|facial wash)\b/i],
  ];
  const NICHE_PTS = { hp: 25, rumah: 25, gadget: 10, lainnya: 5, fashion: 0, beauty: 0 };
  const CHAMPION_NICHES = ["hp", "rumah"];

  function nicheOf(ad) {
    const t = String((ad && ad.body) || "") + " " + String((ad && ad.linkUrl) || "");
    for (const [id, label, re] of NICHES) if (re.test(t)) return { id, label };
    return { id: "lainnya", label: "Lainnya" };
  }

  // Competitor pattern across everything captured on this page view.
  function competitorStats(list) {
    const byLink = {}, byNiche = {};
    for (const ad of list || []) {
      const n = nicheOf(ad).id, link = shopeeLink(ad);
      const s = byNiche[n] || (byNiche[n] = { ads: 0, terbukti: 0, pages: new Set() });
      s.ads++; s.pages.add(ad.pageId || ad.pageName);
      if ((ad.days || 0) >= 14) s.terbukti++;
      if (link) (byLink[link] || (byLink[link] = new Set())).add(ad.pageId || ad.pageName);
    }
    return { byLink, byNiche };
  }

  function polaScore(ad, stats) {
    stats = stats || competitorStats([ad]);
    const d = ad.days || 0, v = ad.variants || 1;
    const niche = nicheOf(ad), link = shopeeLink(ad);
    const advertisers = link && stats.byLink[link] ? stats.byLink[link].size : 0;
    const ns = stats.byNiche[niche.id] || { ads: 0, terbukti: 0, pages: new Set() };
    const parts = [
      ["Lama tayang " + d + " hari", Math.round(Math.min(d, 30) / 30 * 35), 35],
      ["Variasi " + v + (v >= 3 ? " (di-scale)" : ""), Math.round(Math.min(v - 1, 4) / 4 * 15), 15],
      ["Niche " + niche.label + (CHAMPION_NICHES.includes(niche.id) ? " (niche champion kita)" : ""), NICHE_PTS[niche.id], 25],
      [link ? "Ada link Shopee (bisa dianalisa)" : "Tanpa link Shopee", link ? 10 : 0, 10],
      ["Link sama dipakai " + advertisers + " pengiklan", advertisers >= 2 ? 10 : 0, 10],
      ["Niche ini: " + ns.terbukti + " iklan TERBUKTI di halaman", ns.terbukti >= 3 ? 5 : 0, 5],
    ];
    const score = parts.reduce((a, p) => a + p[1], 0);
    const tier = score >= 70 ? "CHAMPION" : score >= 45 ? "MIRIP" : "LEMAH";
    const warn = [];
    if (niche.id === "fashion" || niche.id === "beauty")
      warn.push("Niche ini di data kita komisi/order kecil atau jarang belanja (shellaSaukia, niigelFlatshoes).");
    if (d < 14) warn.push("Belum 14 hari: iklan kompetitor belum terbukti untung.");
    return { score, tier, niche, parts, warn, advertisers };
  }

  global.RMFbAdLib = { isLibraryUrl, parseDocs, extractAds, extractFromText, filename, downloadsFor,
    signal, rank, trackDiff, shopeeLink, sanitizeBody, briefPrompt, cleanBrief, cardIdFromText, countCardIds, slug, CARD_ID_RE,
    NICHES, CHAMPION_NICHES, nicheOf, competitorStats, polaScore };
  if (typeof module !== "undefined" && module.exports) module.exports = global.RMFbAdLib;
})(typeof self !== "undefined" ? self : this);
