/* ledger.js — LEARNING LEDGER.
 *
 * Fikri's model is a WINNER-FINDING MACHINE: winners run untouched, losing
 * campaigns are LEARNING COST. His rule (2026-09-17): every learning cost MUST
 * produce a lesson. The kill decision itself is already handled by Zaki's rule
 * in his head (CPC>Rp150 2 days / 3-day ROAS<1) — the PLUGIN's job is NOT to
 * decide kills, it is to CAPTURE and ACCELERATE the learning from each content
 * experiment.
 *
 * Each ledger entry ties a CONTENT EXPERIMENT to its outcome, keyed by the
 * Shopee tag (same tag Fikri uses in Meta campaign name + Shopee custom link —
 * his choice 2026-09-17, because realized EPC/ROAS only exists at tag level).
 *
 * TWO capture paths:
 *   A) generated in-plugin  -> tag + concept + product features + reasoning
 *      (reasoning MANDATORY, short is fine — his rule)
 *   B) external (TikTok download) -> manual "catat campaign eksternal": tag +
 *      reasoning, since it never passed through the generator.
 *
 * On snapshot import we JOIN entries to per-tag performance and auto-classify
 * the failure mode — the single most valuable lesson:
 *   CR low            -> WRONG PRODUCT  (don't repeat similar products)
 *   CR ok but EPC<CPC -> WRONG CREATIVE (good product, try another angle)
 *
 * Self-contained: chrome.storage.local only, no network.
 */
(function (global) {
  "use strict";

  const KEY = "rm_ledger";
  const CAP = 3000;

  function today() { return new Date().toISOString().slice(0, 10); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  async function _get() {
    try {
      if (global.chrome && chrome.storage && chrome.storage.local) {
        return await new Promise((r) =>
          chrome.storage.local.get([KEY], (o) => r((o && o[KEY]) || [])));
      }
    } catch (_) {}
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (_) { return []; }
  }
  async function _set(v) {
    try {
      if (global.chrome && chrome.storage && chrome.storage.local) {
        return await new Promise((r) => chrome.storage.local.set({ [KEY]: v }, () => r(true)));
      }
    } catch (_) {}
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {}
  }

  /* Add an experiment entry.
   * e = { tag, reasoning?, concept?, source?, product? }
   *   tag       (required) Shopee tag = Meta campaign name
   *   reasoning (OPTIONAL since 2026-09-21) free-text hypothesis. Used to be
   *             mandatory and collected via a form before every generate;
   *             Fikri removed that form, so entries are now written silently
   *             and this is normally empty. The verdict/failure-mode logic does
   *             NOT depend on it — that comes from CR vs CPC on the snapshot.
   *   concept   the rotated concept id (auto for path A)
   *   source    "plugin" | "external"
   *   product   { category, price, rating } snapshot of features at launch
   */
  async function add(e) {
    if (!e || !e.tag) return { error: "tag wajib." };
    const rows = await _get();
    const entry = {
      id: uid(), day: today(), ts: Date.now(),
      tag: String(e.tag).trim(),
      reasoning: e.reasoning ? String(e.reasoning).trim().slice(0, 200) : "",
      concept: e.concept || null,
      source: e.source || "plugin",
      category: (e.product && (e.product.category || e.product.category_l1)) || null,
      price: (e.product && e.product.price != null) ? e.product.price : null,
      rating: (e.product && e.product.rating != null) ? e.product.rating : null,
      // verdict fields, filled on join:
      verdict: null, failure_mode: null, epc: null, roas: null, cr: null
    };
    rows.push(entry);
    if (rows.length > CAP) rows.shift();
    await _set(rows);
    return { total: rows.length, entry };
  }

  async function all() { return _get(); }
  async function clear() { await _set([]); return true; }

  /* Join ledger entries to a performance snapshot and classify each.
   * snapshot.tags[tag] = { epc, roas, clicks, orders, conversionRate?, ... }
   * breakEvenCpc from config lets us split WRONG-PRODUCT vs WRONG-CREATIVE.
   * Returns the enriched entries AND writes verdicts back to storage. */
  async function classify(snapshot, opts) {
    const rows = await _get();
    if (!snapshot || !snapshot.tags) return rows;
    const breakEven = (opts && opts.breakEvenCpc) || 0;
    // conversion threshold below which we call the PRODUCT wrong (not the creative)
    const CR_FLOOR = (opts && opts.crFloor) || 2.0;   // percent

    for (const r of rows) {
      const st = snapshot.tags[r.tag];
      if (!st) continue;
      const clicks = Number(st.clicks) || 0;
      const orders = Number(st.orders) || 0;
      const epc = st.epc != null ? Number(st.epc) : (clicks ? (Number(st.commission) || 0) / clicks : 0);
      const roas = st.roas != null ? Number(st.roas) : null;
      const cr = st.conversionRate != null ? Number(st.conversionRate)
        : (clicks ? orders / clicks * 100 : 0);
      r.epc = Math.round(epc); r.roas = roas; r.cr = Math.round(cr * 100) / 100;

      // need enough clicks before any verdict is trustworthy
      if (clicks < 25) { r.verdict = "belum cukup data"; r.failure_mode = null; continue; }

      const profitable = roas != null ? roas >= 1 : (breakEven > 0 ? epc >= breakEven : epc > 0);
      if (profitable) {
        r.verdict = "WINNER";
        r.failure_mode = null;
      } else {
        r.verdict = "LEARNING COST";
        // THE key split: is it the product or the creative?
        if (cr < CR_FLOOR) {
          r.failure_mode = "produk-salah";   // low CR: people click, don't buy -> product/price/fit
        } else if (breakEven > 0 && epc < breakEven) {
          r.failure_mode = "creative-salah"; // CR ok but click too expensive -> weak hook/creative
        } else {
          r.failure_mode = "tipis";          // borderline
        }
      }
    }
    await _set(rows);
    return rows;
  }

  /* Human-readable lessons aggregated across classified entries.
   * Produces per-(category × failure_mode) and per-(concept) patterns so the UI
   * can warn before advertising a product that fits a known losing pattern. */
  function lessons(rows) {
    const out = { losingCategories: {}, winningConcepts: {}, byTag: {} };
    for (const r of (rows || [])) {
      if (!r.verdict || r.verdict === "belum cukup data") continue;
      out.byTag[r.tag] = { verdict: r.verdict, failure_mode: r.failure_mode,
                           roas: r.roas, cr: r.cr, reasoning: r.reasoning,
                           category: r.category, concept: r.concept };
      if (r.verdict === "LEARNING COST" && r.category) {
        const k = r.category + " · " + (r.failure_mode || "?");
        out.losingCategories[k] = (out.losingCategories[k] || 0) + 1;
      }
      if (r.verdict === "WINNER" && r.concept) {
        out.winningConcepts[r.concept] = (out.winningConcepts[r.concept] || 0) + 1;
      }
    }
    return out;
  }

  /* Warn before advertising a NEW product: does it resemble a known losing
   * pattern (same category that has repeatedly failed on WRONG-PRODUCT)? */
  async function warn(product, snapshot, opts) {
    const rows = await classify(snapshot, opts);
    const L = lessons(rows);
    const cat = (product && (product.category || product.category_l1)) || null;
    if (!cat) return null;
    const pkey = cat + " · produk-salah";
    const n = L.losingCategories[pkey] || 0;
    if (n >= 2) {
      // suggest the concept that has won most often (if any)
      const bestConcept = Object.entries(L.winningConcepts).sort((a, b) => b[1] - a[1])[0];
      return {
        risk: "tinggi",
        message: `Kategori "${cat}" sudah ${n}x jadi learning cost karena CR rendah ` +
          `(produk-salah). Pertimbangkan ulang, atau kalau tetap coba` +
          (bestConcept ? `, pakai konsep "${bestConcept[0]}" yang paling sering menang.` : "."),
        losses: n
      };
    }
    return null;
  }

  function toCsv(rows) {
    const head = ["day", "tag", "verdict", "failure_mode", "roas", "cr", "epc",
                  "concept", "category", "price", "rating", "source", "reasoning"];
    const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    return head.join(",") + "\n" +
      (rows || []).map((r) => head.map((k) => esc(r[k])).join(",")).join("\n");
  }

  global.RMLedger = { add, all, clear, classify, lessons, warn, toCsv };
})(typeof window !== "undefined" ? window : this);
