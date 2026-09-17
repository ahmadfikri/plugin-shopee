/* conceptperf.js — CONCEPT WIN-RATE LOOP.
 *
 * Closes the loop the Sept-16 assessment flagged as broken: the generator now
 * ROTATES concepts (concepts.js) but never learned which concept WINS. This
 * module records, per generated video, {tag, concept, date}, then JOINS that log
 * to the imported performance snapshot's per-tag EPC/ROAS so the panel can show
 * "for casing, before/after ROAS 2.1 vs price-shock 0.9" and bias future rotation
 * toward the winning concept per category.
 *
 * HONEST LIMITATION (must be surfaced in the UI, not hidden):
 *   EPC/ROAS is measured at the TAG level, not per video. So a concept's win-rate
 *   is only trustworthy when a tag ran ONE dominant concept over a period. If a
 *   tag mixed concepts on the same days, the signal is muddy. We therefore label
 *   every verdict with a confidence and NEVER claim more certainty than the data
 *   supports. This is a directional learning aid, not proof.
 *
 * Self-contained: chrome.storage.local only, no network.
 */
(function (global) {
  "use strict";

  const KEY = "rm_concept_log";     // [{tag, concept, ts, day}]
  const CAP = 4000;

  function today() { return new Date().toISOString().slice(0, 10); }

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

  // Record that a video with `concept` was generated for `tag`.
  async function log(tag, concept) {
    if (!tag || !concept) return;
    const rows = await _get();
    rows.push({ tag: String(tag), concept: String(concept), day: today(), ts: Date.now() });
    if (rows.length > CAP) rows.shift();
    await _set(rows);
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
    const rows = await _get();
    if (!rows.length || !snapshot || !snapshot.tags) return { concepts: [], note: "belum ada data" };

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
