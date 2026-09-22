/* conceptperf.js — EXACT CONCEPT WIN-RATE LOOP.
 *
 * v0.9 records one concept against the exact Experiment ID that is used as both
 * Meta campaign name and Shopee tag. When that ID appears in a performance
 * snapshot, EPC/ROAS is attributable 1:1. Legacy broad-tag logs are retained but
 * ignored: assigning one tag's lifetime ROAS to several concepts was not causal
 * evidence and could bias generation toward a false winner.
 *
 * Self-contained: chrome.storage.local only, no network.
 */
(function (global) {
  "use strict";

  const KEY = "rm_concept_log";     // [{tag, concept, ts, day}]
  const CAP = 4000;

  function today() { return new Date().toISOString().slice(0, 10); }


  let mutationQueue = Promise.resolve();
  function serialized(task) {
    const run = mutationQueue.then(task, task);
    mutationQueue = run.catch(() => {});
    return run;
  }
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
    if (global.chrome && chrome.storage && chrome.storage.local) {
      return new Promise((r, reject) => chrome.storage.local.set({ [KEY]: v }, () => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if (err) reject(new Error("Concept performance gagal disimpan: " + err.message)); else r(true);
      }));
    }
    localStorage.setItem(KEY, JSON.stringify(v));
    return true;
  }

  // Record one EXACT experiment. Caption + video reuse the same experiment ID,
  // so repeated logging is deduplicated. Legacy broad-tag rows remain stored but
  // are deliberately ignored by winRates (their attribution was not causal).
  async function logUnsafe(tag, concept, experimentId) {
    if (!tag || !concept || !experimentId) return;
    const rows = await _get();
    if (rows.some((r) => r.experimentId === experimentId)) return;
    rows.push({ tag: String(tag), concept: String(concept),
                experimentId: String(experimentId), attribution: "exact",
                day: today(), ts: Date.now() });
    if (rows.length > CAP) rows.shift();
    await _set(rows);
  }

  function log(tag, concept, experimentId) {
    return serialized(() => logUnsafe(tag, concept, experimentId));
  }

  async function all() { return _get(); }
  async function clear() { await _set([]); return true; }

  /* Build the win-rate view by joining the concept log to a performance snapshot.
   * snapshot.tags[tag] = { epc, roas, clicks, orders, ... }.
   * Returns per-concept aggregates:
   *   { concept, tags:[...], videos, avgEpc, avgRoas, confidence }
   * confidence reflects the honest limitation above: HIGH only when the concept's
   * tags each ran that concept (near-)exclusively; LOW when tags mixed concepts. */
  async function winRates(snapshot) {
    const rowsAll = await _get();
    const rows = rowsAll.filter((r) => r.attribution === "exact" && r.experimentId);
    if (!rows.length || !snapshot || !snapshot.tags) return {
      concepts: [],
      note: rowsAll.length ? "menunggu hasil Experiment ID baru; log broad-tag lama diabaikan"
                           : "belum ada data"
    };

    // For each tag, how many DISTINCT concepts were logged? (mix detector)
    const conceptsPerTag = {};
    for (const r of rows) {
      (conceptsPerTag[r.tag] = conceptsPerTag[r.tag] || new Set()).add(r.concept);
    }

    // Aggregate per concept, weighting each tag's realized EPC/ROAS.
    const agg = {};   // concept -> { tags:Set, videos, epcSum, epcN, roasSum, roasN, pureTags, mixedTags }
    for (const r of rows) {
      const st = snapshot.tags[r.tag];
      const a = agg[r.concept] || (agg[r.concept] = {
        tags: new Set(), videos: 0, epcSum: 0, epcN: 0, roasSum: 0, roasN: 0,
        pureTags: 0, mixedTags: 0
      });
      a.videos++;
      a.tags.add(r.tag);
      if (st) {
        if (st.epc != null) { a.epcSum += Number(st.epc) || 0; a.epcN++; }
        if (st.roas != null) { a.roasSum += Number(st.roas) || 0; a.roasN++; }
      }
    }
    // pure vs mixed tag accounting (per concept, count each tag once)
    for (const [concept, a] of Object.entries(agg)) {
      for (const tag of a.tags) {
        const distinct = conceptsPerTag[tag] ? conceptsPerTag[tag].size : 1;
        if (distinct <= 1) a.pureTags++; else a.mixedTags++;
      }
    }

    const concepts = Object.entries(agg).map(([concept, a]) => {
      const avgEpc = a.epcN ? a.epcSum / a.epcN : null;
      const avgRoas = a.roasN ? a.roasSum / a.roasN : null;
      const tagsN = a.tags.size;
      // confidence: needs enough tags AND those tags to be mostly single-concept
      const pureRatio = tagsN ? a.pureTags / tagsN : 0;
      let confidence = "rendah";
      if (tagsN >= 3 && pureRatio >= 0.7) confidence = "sedang";
      if (tagsN >= 5 && pureRatio >= 0.8) confidence = "tinggi";
      return {
        concept, videos: a.videos, tags: tagsN,
        avgEpc, avgRoas, pureRatio,
        confidence
      };
    }).sort((x, y) => (y.avgRoas || 0) - (x.avgRoas || 0));

    return { concepts, note: null };
  }

  /* Best concept for a given tag's CATEGORY, used to bias rotation. Returns a
   * concept id or null. Only returns a suggestion when confidence is not "rendah"
   * — otherwise rotation stays fully random (don't overfit thin data). */
  async function bestConcept(snapshot) {
    const wr = await winRates(snapshot);
    const top = wr.concepts.find((c) => c.confidence !== "rendah" && c.avgRoas != null && c.avgRoas > 0);
    return top ? top.concept : null;
  }

  global.RMConceptPerf = { log, all, clear, winRates, bestConcept };
})(typeof window !== "undefined" ? window : this);
