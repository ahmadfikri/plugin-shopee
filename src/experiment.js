/* experiment.js — ZERO-TYPING experiment identity.
 *
 * One generated ID is used verbatim as BOTH:
 *   - Meta campaign name
 *   - Shopee tag
 *
 * IDs are safe (lowercase alphanumeric, exactly 20 chars), recognisable, and
 * unique: name(6)+concept(2)+yymmdd(6)+product-hash(3)+random(3), checked
 * against every ID already issued. Caption + video generated from the same open product
 * reuse one experiment until the user clicks "Eksperimen Baru".
 */
(function (global) {
  "use strict";

  const KEY = "rm_experiments_v1";

  let mutationQueue = Promise.resolve();
  function serialized(task) {
    const run = mutationQueue.then(task, task);
    mutationQueue = run.catch(() => {});
    return run;
  }
  const CAP = 3000;
  const CONCEPT_CODE = {
    curiosity: "cu", price_shock: "pr", before_after: "ba", pov: "pv",
    mistake_warning: "mw", satisfying: "sf", problem_solve: "ps",
    comparison: "cp"
  };

  function dayCode(d) {
    const x = d || new Date();
    const yy = String(x.getFullYear()).slice(-2);
    const mm = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    return yy + mm + dd;
  }

  function slug(v) {
    return String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function baseTag(product) {
    const p = product || {};
    return p.suggestedTag ||
      (p.epcPred && p.epcPred.matchedTag) ||
      (p.calib && p.calib.matchedTag) ||
      (p.pro && p.pro.economics && p.pro.economics.matchedTag) ||
      p.name || "produk";
  }

  async function _get() {
    try {
      if (global.chrome && chrome.storage && chrome.storage.local) {
        return await new Promise((r) => chrome.storage.local.get([KEY], (o) =>
          r((o && o[KEY]) || { counters: {}, rows: [] })));
      }
    } catch (_) {}
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{"counters":{},"rows":[]}');
    } catch (_) { return { counters: {}, rows: [] }; }
  }

  async function _set(v) {
    if (global.chrome && chrome.storage && chrome.storage.local) {
      return new Promise((r, reject) => chrome.storage.local.set({ [KEY]: v }, () => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if (err) reject(new Error("Experiment ID gagal disimpan: " + err.message)); else r(true);
      }));
    }
    localStorage.setItem(KEY, JSON.stringify(v));
    return true;
  }

  // 3-char base36 hash (46,656 buckets) — fingerprints the exact product.
  function hash3(v) {
    let h = 2166136261;
    const s = String(v || "");
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h % 46656).toString(36).padStart(3, "0");
  }

  // 3 random base36 chars (46,656 values). Uniqueness no longer depends on a
  // local counter that resets when storage is cleared or another PC is used.
  function rand3() {
    let n;
    try {
      const a = new Uint32Array(1);
      (global.crypto || crypto).getRandomValues(a);
      n = a[0];
    } catch (_) { n = Math.floor(Math.random() * 4294967296); }
    return (n % 46656).toString(36).padStart(3, "0");
  }

  /* ID layout (exactly 20 chars, lowercase a-z0-9):
   *   name(6) + concept(2) + yymmdd(6) + product(3) + random(3)
   *   e.g. polkadps261003k3fx9a
   * Readable part first (product · concept · day), then 6 chars of entropy:
   * product fingerprint separates two products with similar names, random
   * separates repeated experiments on the same product/concept/day. */
  function makeId(base, conceptId, code, productKey, rnd) {
    const clean = slug(base) || "produk";
    const name = (clean + "xxxxxx").slice(0, 6);
    const cc = CONCEPT_CODE[conceptId] || "xx";
    const pk = hash3(productKey || clean);
    const r = rnd || rand3();
    return (name + cc + code + pk + r).slice(0, 20);
  }

  function hypothesis(product, conceptId) {
    const p = product || {};
    const concept = global.RMConcepts && global.RMConcepts.byId
      ? global.RMConcepts.byId(conceptId) : null;
    const label = concept ? concept.label : (conceptId || "konsep baru");
    const angle = concept ? concept.angle : "uji apakah angle ini menghasilkan klik dan order";
    return `Uji ${label} untuk ${p.name || "produk"}: ${angle}`.slice(0, 300);
  }

  async function ensureUnsafe(product, conceptId) {
    const p = product || {};
    if (p.__experiment && p.__experiment.campaignTag) return p.__experiment;
    const state = await _get();
    state.counters = state.counters || {}; state.rows = state.rows || [];
    const base = String(baseTag(p)).trim();
    const day = dayCode();
    const key = slug(base) + "|" + day;
    const seq = (Number(state.counters[key]) || 0) + 1;
    state.counters[key] = seq;
    // Never reuse an ID already issued on this browser (retry the random part).
    const used = new Set(state.rows.map((r) => r && r.campaignTag));
    const productKey = p.id || p.href || p.name || base;
    let campaignTag = makeId(base, conceptId, day, productKey);
    for (let i = 0; used.has(campaignTag) && i < 20; i++) {
      campaignTag = makeId(base, conceptId, day, productKey);
    }
    if (used.has(campaignTag)) throw new Error("Experiment ID bentrok, coba lagi.");
    const entry = {
      experimentId: campaignTag,
      campaignTag,
      metaCampaignName: campaignTag,
      shopeeTag: campaignTag,
      baseTag: base,
      concept: conceptId || null,
      sequence: seq,
      day,
      ts: Date.now(),
      productId: p.id || null,
      productName: p.name || null,
      productUrl: p.href || null,
      hypothesis: hypothesis(p, conceptId)
    };
    state.rows.push(entry);
    while (state.rows.length > CAP) state.rows.shift();
    await _set(state);
    p.__experiment = entry;
    p.__experimentConcept = conceptId || null;
    return entry;
  }

  function ensure(product, conceptId) {
    return serialized(() => ensureUnsafe(product, conceptId));
  }

  function reset(product) {
    const p = product || {};
    delete p.__experiment;
    delete p.__experimentConcept;
    delete p.__concept;
    return true;
  }

  async function all() { const s = await _get(); return s.rows || []; }

  function toCsv(rows) {
    const head = ["experimentId", "campaignTag", "baseTag", "concept", "day",
      "productId", "productName", "productUrl", "hypothesis"];
    const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    return head.join(",") + "\n" +
      (rows || []).map((r) => head.map((k) => esc(r[k])).join(",")).join("\n");
  }

  global.RMExperiment = { ensure, reset, all, toCsv, makeId, baseTag, hypothesis, CONCEPT_CODE };
})(typeof window !== "undefined" ? window : this);
