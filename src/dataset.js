/* dataset.js — TRAINING DATA COLLECTOR.
 *
 * One-click capture of everything scrapeable on a product-detail page, stored in
 * chrome.storage.local as a growing labelled dataset. This is the seed for a
 * real predictive model LATER (Fikri's plan): today ~33 products is too few for
 * ML, but every manual capture grows the set. When it's big enough we train.
 *
 * We store RAW features (not scores) so future models can use them however they
 * like. Deliberately plugin-owned, local only, never touches the analysis sheets.
 *
 * Boundary: this reads only the DOM Fikri already opened. No auto-fetch, no API.
 */
(function (global) {
  "use strict";


  let mutationQueue = Promise.resolve();
  function serialized(task) {
    const run = mutationQueue.then(task, task);
    mutationQueue = run.catch(() => {});
    return run;
  }
  const KEY = "rm_dataset";
  const CAP = 5000;

  function nowIso() { return new Date().toISOString(); }

  // Pull every feature worth keeping from a scraped detail object + product.
  // Kept deliberately flat + raw so a future model can engineer its own features.
  function buildRow(detail, product, cfg) {
    const d = detail || {};
    const p = product || {};
    // star breakdown -> % of 4-5 star (trust signal)
    let pct45 = null;
    if (d.starBreakdown && typeof d.starBreakdown === "object") {
      const b = d.starBreakdown;
      const tot = Object.values(b).reduce((s, n) => s + (Number(n) || 0), 0);
      const positive = Array.isArray(b)
        ? (Number(b[3]) || 0) + (Number(b[4]) || 0)   // detail scraper: 1★..5★ at 0..4
        : (Number(b[4]) || 0) + (Number(b[5]) || 0);  // object fixture: keys 1..5
      if (tot > 0) pct45 = positive / tot;
    }
    const price = p.price || d.price || null;
    // Commission: PREFER the product's own scraped rate (listing cards expose the
    // REAL "Comm Rate 11,5%" via .commRate). cfg.commissionPct is only a global
    // ASSUMPTION — never let it overwrite a measured per-product value, so it is
    // used solely as a last-resort fallback.
    const commPct = (p.commissionPct != null) ? p.commissionPct
      : (d.commissionPct != null) ? d.commissionPct
      : null;
    const idParts = String(p.id || "").split(".");
    return {
      captured_at: nowIso(),
      // identity
      url: p.href || location.href,
      shopid: d.shopid || (idParts.length === 2 ? idParts[0] : null),
      itemid: d.itemid || (idParts.length === 2 ? idParts[1] : null),
      name: d.name || p.name || null,
      // --- FEATURES (inputs a model would learn from) ---
      price: price,
      commission_pct: commPct,
      rating: d.rating != null ? d.rating : (p.rating || null),
      review_count: d.totalReviews != null ? d.totalReviews : (p.reviewCount || null),
      pct_4_5_star: pct45,
      liked_count: d.likedCount != null ? d.likedCount : (p.likedCount || null),
      historical_sold: d.historicalSold != null ? d.historicalSold : (p.soldTotal || null),
      in_stock: d.inStock != null ? d.inStock : null,
      has_video: !!(global.RMVideo && global.RMVideo.hasVideo && global.RMVideo.hasVideo()),
      shop_type: d.shopType || null,
      is_official: d.isOfficial != null ? d.isOfficial : null,
      // category is the single most useful free feature — capture whatever is on the page
      category_l1: d.categoryL1 || null,
      category_l2: d.categoryL2 || null,
      category_l3: d.categoryL3 || null,
      // impulse-price bucket (cheap = higher click appeal, historically)
      price_bucket: price == null ? null
        : price < 30000 ? "<30k"
        : price < 70000 ? "30-70k"
        : price < 150000 ? "70-150k"
        : price < 300000 ? "150-300k" : ">300k",
      // --- LABEL slot (filled later from performance snapshot by tag) ---
      // left null here; joined to realized EPC when a snapshot is imported.
      tag: null,
      realized_epc: null,
      realized_roas: null
    };
  }

  async function _get() {
    try {
      if (global.chrome && chrome.storage && chrome.storage.local) {
        return await new Promise((res) =>
          chrome.storage.local.get([KEY], (o) => res((o && o[KEY]) || [])));
      }
    } catch (_) {}
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (_) { return []; }
  }
  async function _set(rows) {
    if (global.chrome && chrome.storage && chrome.storage.local) {
      return new Promise((res, reject) =>
        chrome.storage.local.set({ [KEY]: rows }, () => {
          const err = chrome.runtime && chrome.runtime.lastError;
          if (err) reject(new Error("Dataset gagal disimpan: " + err.message));
          else res(true);
        }));
    }
    localStorage.setItem(KEY, JSON.stringify(rows));
    return true;
  }

  // Save a capture. Dedup by itemid (or url): re-capturing UPDATES the row and
  // keeps the earliest captured_at, so you can refresh a product's features
  // without creating duplicates.
  //
  // MERGE RULE (important): a new row NEVER overwrites an existing non-null field
  // with null. A listing page yields thin rows (no rating/reviews/stock); a detail
  // page yields rich ones. Without this rule a later bulk scan would wipe the rich
  // data captured from a detail page.
  function mergeRow(oldRow, newRow) {
    const out = Object.assign({}, oldRow);
    for (const [k, v] of Object.entries(newRow)) {
      if (v === null || v === undefined || v === "") continue;   // keep old value
      out[k] = v;
    }
    // richness must not regress: 'detail' beats 'listing'
    if (oldRow.source === "detail" && newRow.source === "listing") {
      out.source = "detail";
    }
    return out;
  }

  async function captureUnsafe(detail, product, cfg, opts) {
    const row = buildRow(detail, product, cfg);
    row.source = (opts && opts.source) || "detail";
    row.auto = !!(opts && opts.auto);
    const rows = await _get();
    const keyOf = (r) => (r.itemid ? "i:" + r.itemid : "u:" + r.url);
    const k = keyOf(row);
    const idx = rows.findIndex((r) => keyOf(r) === k);
    if (idx >= 0) {
      const merged = mergeRow(rows[idx], row);
      merged.captured_at = rows[idx].captured_at;   // keep first-seen
      merged.first_seen = rows[idx].first_seen || rows[idx].captured_at;
      merged.updated_at = nowIso();
      merged.capture_count = (rows[idx].capture_count || 1) + 1;
      rows[idx] = merged;
    } else {
      row.first_seen = row.captured_at;
      row.capture_count = 1;
      rows.push(row);
      if (rows.length > CAP) rows.shift();
    }
    await _set(rows);
    return { total: rows.length, updated: idx >= 0, row: rows[idx >= 0 ? idx : rows.length - 1] };
  }

  /* Auto-capture MANY products at once — used for listing/bulk-scan pages, where
   * each product yields a THIN row (no rating/review/stock, those only exist on
   * the detail page). Thin rows are still valuable: price, commission, name and
   * category are exactly the features a future model needs, and bulk scan
   * produces hundreds of them for free.
   * Returns {added, updated, total}. */
  async function captureManyUnsafe(products, cfg, opts) {
    const list = Array.isArray(products) ? products : [];
    if (!list.length) return { added: 0, updated: 0, total: (await _get()).length };
    const rows = await _get();
    const keyOf = (r) => (r.itemid ? "i:" + r.itemid : "u:" + r.url);
    const index = new Map(rows.map((r, i) => [keyOf(r), i]));
    let added = 0, updated = 0;

    for (const p of list) {
      if (!p) continue;
      // derive itemid/url from the listing product shape ("shopid.itemid")
      const parts = String(p.id || "").split(".");
      const detailish = {
        name: p.name,
        shopid: parts.length === 2 ? parts[0] : null,
        itemid: parts.length === 2 ? parts[1] : null,
        rating: p.rating != null ? p.rating : null,
        totalReviews: p.reviewCount != null ? p.reviewCount : null,
        historicalSold: p.soldTotal != null ? p.soldTotal : null
      };
      const row = buildRow(detailish, p, cfg);
      row.url = p.href || row.url;
      row.source = "listing";
      row.auto = true;
      // listing pages do expose commission per card — keep the product's own value
      if (p.commissionPct != null) row.commission_pct = p.commissionPct;
      if (p.hasVideo != null) row.has_video = !!p.hasVideo;

      const k = keyOf(row);
      if (index.has(k)) {
        const i = index.get(k);
        const merged = mergeRow(rows[i], row);
        merged.captured_at = rows[i].captured_at;
        merged.first_seen = rows[i].first_seen || rows[i].captured_at;
        merged.updated_at = nowIso();
        merged.capture_count = (rows[i].capture_count || 1) + 1;
        rows[i] = merged;
        updated++;
      } else {
        row.first_seen = row.captured_at;
        row.capture_count = 1;
        rows.push(row);
        index.set(k, rows.length - 1);
        added++;
      }
    }
    let final = rows;
    if (final.length > CAP) final = final.slice(final.length - CAP);
    await _set(final);
    return { added, updated, total: final.length };
  }

  function capture(detail, product, cfg, opts) {
    return serialized(() => captureUnsafe(detail, product, cfg, opts));
  }
  function captureMany(products, cfg, opts) {
    return serialized(() => captureManyUnsafe(products, cfg, opts));
  }

  async function all() { return _get(); }
  async function count() { return (await _get()).length; }
  async function clear() { await _set([]); return true; }

  function toCsv(rows) {
    if (!rows || !rows.length) return "";
    const cols = Object.keys(rows[0]);
    const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    return cols.join(",") + "\n" +
      rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  }

  global.RMDataset = { capture, captureMany, all, count, clear, toCsv, buildRow, mergeRow };
})(typeof window !== "undefined" ? window : this);
