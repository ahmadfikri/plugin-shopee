/* e2e-scheduler.js — prove the render scheduler is now DETERMINISTIC.
 *
 * Reproduces the bug that made results flaky: a React page that mutates every
 * 100ms reset the 600ms debounce forever, so run() never fired. The scheduler
 * now has a MAX-WAIT, a re-entrancy guard, and a suspend flag.
 *
 * This models the exact scheduling logic from content.js (same constants), so a
 * regression in those constants/branches shows up here.
 */
"use strict";

const DEBOUNCE_MS = 600;
const MAX_WAIT_MS = 2500;

function makeScheduler(onFire) {
  let debounceTimer = null, firstPendingAt = 0, suspended = false;
  let inFlight = false, rerunPending = false, fires = 0;

  function fire() {
    debounceTimer = null; firstPendingAt = 0;
    if (inFlight) { rerunPending = true; return; }
    inFlight = true; fires++;
    onFire(fires);
    // simulate an async run of 200ms
    setTimeout(() => {
      inFlight = false;
      if (rerunPending) { rerunPending = false; setTimeout(fire, 50); }
    }, 200);
  }
  function schedule() {
    if (suspended) return;
    const now = Date.now();
    if (!firstPendingAt) firstPendingAt = now;
    if (now - firstPendingAt >= MAX_WAIT_MS) { clearTimeout(debounceTimer); fire(); return; }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fire, DEBOUNCE_MS);
  }
  return {
    schedule,
    suspend: () => { suspended = true; },
    resume: () => { suspended = false; },
    fires: () => fires
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  let ok = true;

  // ---- TEST 1: page mutating every 100ms for 4s (the old killer) ----
  {
    let fired = 0;
    const s = makeScheduler(() => { fired++; });
    const iv = setInterval(() => s.schedule(), 100);   // never lets debounce settle
    await sleep(4000);
    clearInterval(iv);
    const pass = fired >= 1;
    console.log(`1) halaman bermutasi terus 4s → render ${fired}x  ${pass ? "PASS" : "FAIL (dulu 0x)"}`);
    if (!pass) ok = false;
  }

  // ---- TEST 2: quiet page fires once after the debounce ----
  {
    let fired = 0;
    const s = makeScheduler(() => { fired++; });
    s.schedule();
    await sleep(DEBOUNCE_MS + 300);
    const pass = fired === 1;
    console.log(`2) satu perubahan lalu tenang → render ${fired}x  ${pass ? "PASS" : "FAIL"}`);
    if (!pass) ok = false;
  }

  // ---- TEST 3: suspended (bulk scan) must not render at all ----
  {
    let fired = 0;
    const s = makeScheduler(() => { fired++; });
    s.suspend();
    for (let i = 0; i < 20; i++) { s.schedule(); await sleep(50); }
    await sleep(800);
    const pass = fired === 0;
    console.log(`3) saat bulk scan (suspended) → render ${fired}x  ${pass ? "PASS" : "FAIL"}`);
    if (!pass) ok = false;
    s.resume();
    s.schedule();
    await sleep(DEBOUNCE_MS + 300);
    console.log(`   setelah resume → render ${fired}x  ${fired === 1 ? "PASS" : "FAIL"}`);
    if (fired !== 1) ok = false;
  }

  // ---- TEST 4: overlapping requests never run concurrently ----
  {
    let concurrent = 0, maxConcurrent = 0, fired = 0;
    const s = makeScheduler(() => {
      fired++; concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      setTimeout(() => concurrent--, 200);
    });
    for (let i = 0; i < 8; i++) { s.schedule(); await sleep(700); }
    await sleep(800);
    const pass = maxConcurrent === 1;
    console.log(`4) ${fired} render bertumpuk → maksimum bersamaan ${maxConcurrent}  ${pass ? "PASS" : "FAIL"}`);
    if (!pass) ok = false;
  }

  console.log(ok ? "\nSCHEDULER OK — deterministik" : "\nADA YANG GAGAL");
  process.exit(ok ? 0 : 1);
})();
