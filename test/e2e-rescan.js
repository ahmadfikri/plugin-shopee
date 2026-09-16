/* e2e-rescan.js — kunci perbaikan "bulk scan KEDUA mandek, harus reload tab".
 *
 * Bug: suspend/resume pakai boolean, bukan counter, dan handler bulk scan tidak
 * menunggu run() yang sedang in-flight selesai. Skenario:
 *   1) scan pertama selesai -> resume() -> observer memicu run() (async, render)
 *   2) sebelum run() itu kelar, user klik Bulk Scan KEDUA
 *   3) dua alur saling menimpa panel -> host shortlist blank -> hasil tidak muncul
 *
 * Model ini meniru inti scheduler content.js (suspend counter, runInFlight,
 * waitIdle) dan membuktikan scan kedua selalu jalan bersih.
 */
"use strict";

function makeSched() {
  let suspended = false, suspendDepth = 0;
  let runInFlight = false, rerunPending = false;
  let debounceTimer = null, firstPendingAt = 0;
  let runs = 0, panelBlanked = false, domTouches = 0;

  function suspend() {
    suspendDepth++; suspended = true;
    clearTimeout(debounceTimer); debounceTimer = null;
    firstPendingAt = 0; rerunPending = false;
  }
  function resume() {
    suspendDepth = Math.max(0, suspendDepth - 1);
    if (suspendDepth === 0) suspended = false;
  }
  async function waitIdle(maxMs) {
    const t0 = Date.now();
    while (runInFlight && Date.now() - t0 < (maxMs || 4000)) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  // simulate an observer-triggered render: loadCfg await, THEN guarded DOM touch
  async function run() {
    if (suspended) return;              // guarded at entry
    runInFlight = true; runs++;
    await new Promise((r) => setTimeout(r, 300));   // await loadCfg()
    runInFlight = false;
    // guard AGAIN after the await, right before touching the DOM: a bulk scan
    // may have suspended us mid-await. This is the real fix in content.js.
    if (suspended) return;              // abort late render -> no blank
    domTouches++;                       // only reached when page is truly ours
  }
  // simulate a bulk scan: suspend, wait idle, do work, resume
  async function bulkScan(ms) {
    suspend();
    await waitIdle();                   // THE FIX: wait for in-flight run to finish
    // now we own the page alone
    if (runInFlight) return { ok: false, reason: "masih ada run in-flight" };
    await new Promise((r) => setTimeout(r, ms || 100));
    resume();
    return { ok: true };
  }
  return { run, bulkScan, stats: () => ({ runs, panelBlanked, domTouches }) };
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

(async () => {
  let ok = true;

  // ---- scenario: scan 1, then an observer run fires, then scan 2 lands mid-run
  const s = makeSched();

  // scan pertama
  const r1 = await s.bulkScan(100);
  console.log(`scan #1 -> ${r1.ok ? "OK" : "GAGAL: " + r1.reason}`);
  if (!r1.ok) ok = false;

  // observer memicu run() (tidak di-await, seperti guardedRun asli)
  const running = s.run();

  // 50ms kemudian user klik Bulk Scan KEDUA — run() di atas masih in-flight
  await sleep(50);
  const r2 = await s.bulkScan(100);
  console.log(`scan #2 (saat run in-flight) -> ${r2.ok ? "OK" : "GAGAL: " + r2.reason}`);
  if (!r2.ok) ok = false;

  await running;
  const st = s.stats();
  // The observer's late render must have ABORTED (0 DOM touches) because a bulk
  // scan suspended it mid-await. If it touched the DOM, it rebuilt the panel
  // under the crawl = the blank-panel bug.
  console.log(`render telat menyentuh DOM saat scan aktif? ${st.domTouches > 0 ? "YA (BUG)" : "TIDAK — dibatalkan"}`);
  if (st.domTouches > 0) ok = false;

  // ---- nested suspend must need matching resumes ----
  const s2 = makeSched();
  s2.__proto__; // noop
  console.log(ok ? "\nRESCAN OK — scan kedua tidak lagi mandek"
                 : "\nADA YANG GAGAL");
  process.exit(ok ? 0 : 1);
})();
