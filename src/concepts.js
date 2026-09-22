/* concepts.js — CONCEPT ROTATION for the video/caption generator.
 *
 * WHY (research 2026-09-16, evidence-graded):
 *  - Meta "Andromeda" rewards creative DIVERSITY of CONCEPT, not audience
 *    targeting. Six hook-swaps of the same idea read as ONE ad. Concept swings
 *    move CPA 2-5x; hook tweaks only 30-100%.
 *  - TikTok stepped up "unoriginal / mass-production" enforcement from 15 Sep
 *    2025: same background/angle across a batch = suppressed reach, commission
 *    freezes. A templated pipeline that pumps near-identical videos is exactly
 *    the flagged pattern.
 *  So the generator must produce DISTINCT CONCEPTS across a product's videos,
 *  each labelled, so (later) we can learn which concept archetype converts.
 *
 * This module owns the concept library and a rotation picker. It is pure data +
 * a tiny bit of state (last concept per tag, in chrome.storage) — no network.
 */
(function (global) {
  "use strict";

  // Named concept archetypes. Each is a DIFFERENT REASON TO CLICK, not a hook
  // reword. Hook formulas below are the evidence-graded scroll-stoppers.
  // camera/set hints force per-video visual variation (anti mass-production).
  const CONCEPTS = [
    { id: "curiosity", label: "Curiosity gap",
      angle: "buka dengan pertanyaan/teka-teki yang HANYA terjawab oleh produk; frame 1 tunjukkan MASALAH sedang terjadi, bukan produk dulu",
      hook: "pertanyaan singkat ('kenapa…', 'gimana bisa…')",
      set: "sudut close-up dramatis, 1 titik fokus" },
    { id: "price_shock", label: "Price shock / specificity",
      angle: "kejutkan dengan harga spesifik yang tak masuk akal murahnya vs hasilnya; angka di on-screen text frame 1",
      hook: "angka konkret ('Rp15.000 doang tapi…')",
      set: "produk dipegang, reveal harga cepat" },
    { id: "before_after", label: "Before / after",
      angle: "kontras dramatis sebelum→sesudah dalam 3 detik pertama; transformasi memuncak sebelum detik ke-3",
      hook: "'gara-gara ini…' / 'sebelum vs sesudah'",
      set: "split atau potongan cepat before/after" },
    { id: "pov", label: "POV / self-relevance",
      angle: "framing 'POV:' menempatkan penonton DI DALAM situasi yang diciptakan produk; baris pertama menyebut situasi persis si penonton",
      hook: "'POV: kamu akhirnya nemu…'",
      set: "sudut orang-pertama, gerak tangan dekat lensa" },
    { id: "mistake_warning", label: "Mistake / loss warning",
      angle: "peringatan kesalahan yang mungkin sedang dilakukan penonton (loss aversion mengalahkan gain); pimpin dengan 'stop/jangan'",
      hook: "'stop beli … sebelum liat ini'",
      set: "frame 'ancaman' dulu, baru reveal solusi" },
    { id: "satisfying", label: "Satisfying / oddly-satisfying demo",
      angle: "momen visual memuaskan (snap/klik/tuang/rapiin) sebagai daya tarik utama; peak sebelum detik 3",
      hook: "'tunggu bagian…' atas gerakan memuaskan",
      set: "macro, gerakan produk sinkron, tempo cepat" },
    { id: "problem_solve", label: "Problem → solution",
      angle: "tunjukkan frustrasi nyata sehari-hari lalu produk menyelesaikannya di depan mata; jawab keberatan #1 secara visual",
      hook: "sebut frustrasi spesifik ke 'kamu'",
      set: "adegan masalah nyata, lalu solusi in-use" },
    { id: "comparison", label: "Comparative showdown",
      angle: "adu 'yang murah vs yang mahal' atau 'biasa vs ini'; tahan pemenangnya ('tebak yang mana')",
      hook: "'yang Rp20rb vs Rp200rb…'",
      set: "split-screen / dua produk berdampingan" }
  ];


  let mutationQueue = Promise.resolve();
  function serialized(task) {
    const run = mutationQueue.then(task, task);
    mutationQueue = run.catch(() => {});
    return run;
  }
  const KEY = "rm_concept_state";   // { tag: [lastConceptIds...] }

  function all() { return CONCEPTS.slice(); }
  function byId(id) { return CONCEPTS.find((c) => c.id === id) || null; }

  async function _get() {
    try {
      if (global.chrome && chrome.storage && chrome.storage.local) {
        return await new Promise((r) =>
          chrome.storage.local.get([KEY], (o) => r((o && o[KEY]) || {})));
      }
    } catch (_) {}
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (_) { return {}; }
  }
  async function _set(v) {
    if (global.chrome && chrome.storage && chrome.storage.local) {
      return new Promise((r, reject) => chrome.storage.local.set({ [KEY]: v }, () => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if (err) reject(new Error("Rotasi konsep gagal disimpan: " + err.message)); else r(true);
      }));
    }
    localStorage.setItem(KEY, JSON.stringify(v));
    return true;
  }

  /* Pick the next concept for a product/tag, ROTATING so a tag never repeats a
   * concept until the whole library has been cycled. This is what dodges the
   * mass-production penalty: consecutive videos for the same product are forced
   * to be different concepts. Returns the concept object and records the choice.
   */
  async function nextUnsafe(tagOrName) {
    const key = String(tagOrName || "global").trim().toLowerCase() || "global";
    const state = await _get();
    const recent = state[key] || [];
    // candidates = concepts not used recently (until library exhausts, then reset)
    let pool = CONCEPTS.filter((c) => !recent.includes(c.id));
    if (!pool.length) pool = CONCEPTS.slice();   // cycled through all, start over
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const nextRecent = recent.concat(pick.id).slice(-(CONCEPTS.length - 1));
    state[key] = nextRecent;
    await _set(state);
    return pick;
  }

  function next(tagOrName) { return serialized(() => nextUnsafe(tagOrName)); }

  // Synchronous pick WITHOUT recording (for tests / previews).
  function pick(seed) {
    const i = Math.abs(Number.isFinite(seed) ? seed : Math.floor(Math.random() * CONCEPTS.length)) % CONCEPTS.length;
    return CONCEPTS[i];
  }

  global.RMConcepts = { all, byId, next, pick, CONCEPTS };
})(typeof window !== "undefined" ? window : this);
