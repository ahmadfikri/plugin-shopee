#!/usr/bin/env node
/* e2e-loading-guard.js — REGRESSI: bulk scan keyword mengembalikan "0/1 kata
 * kunci, total 0 produk" padahal hasil pencarian jelas terlihat di halaman.
 *
 * Akar masalah (2026-09-23): pageLoading() dulu mencocokkan
 *   [class*='loading' i]
 * yang kelewat luas untuk halaman React/antd. Satu node visible permanen seperti
 * `image-loading` / `lazyloading` / `loadingWrapper` membuat pageLoading() selalu
 * true, sehingga waitForSearchResult() tidak pernah bisa memenuhi
 * `transitioned && !loading` -> hasil dianggap tidak terverifikasi -> tidak ada
 * yang disimpan.
 *
 * Kenapa hanya keyword yang kena: bulk scan KATEGORI memakai waitForChange(),
 * yang tidak pernah memanggil pageLoading(). Asimetri itulah yang menunjuk bug.
 *
 * Test ini mensimulasikan halaman dengan node 'image-loading' visible permanen +
 * hasil pencarian yang berubah, lalu menuntut waitForSearchResult() TETAP ready.
 */
"use strict";
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

// --- fake DOM: cards that change after the "search", plus a permanently
// visible node whose class merely CONTAINS "loading" (the trap). ---
let cards = ["lama-1", "lama-2", "lama-3"];

function makeNode(cls, visible) {
  return {
    className: cls,
    offsetParent: visible ? {} : null,
    getAttribute: (a) => (a === "aria-hidden" ? null : null)
  };
}

// The hazard: a lazy-image wrapper that is visible for the whole session.
const stuckLoadingNode = makeNode("image-loading lazyloading", true);

const ctx = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  window: {},
  document: {
    querySelectorAll: (sel) => {
      // Real antd spinners are NOT present — only the misleading class.
      if (/ant-spin-spinning|ant-skeleton-active|aria-busy/.test(sel)) {
        // old code also matched [class*='loading'] in this same selector string
        return /class\*='loading'/.test(sel) ? [stuckLoadingNode] : [];
      }
      if (/class\*='loading'/.test(sel)) return [stuckLoadingNode];
      return [];
    },
    querySelector: () => null
  }
};
ctx.window = ctx;
ctx.self = ctx;
ctx.window.RMScraper = {
  findCards: () => cards.map((id) => ({
    getAttribute: (a) => (a === "data-itemid" ? id : null),
    querySelector: () => null,
    textContent: id
  })),
  scrapePage: () => ({ keyword: "tumbler", products: [] })
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../src/bulkscan.js", "utf8"), ctx,
                { filename: "bulkscan.js" });

const RMBulk = ctx.window.RMBulk;

(async () => {
  let ok = true;
  const chk = (n, c, d) => {
    console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`);
    if (!c) ok = false;
  };

  // 1. the stuck node must NOT be read as "page is loading" anymore
  //    (pageLoading is internal; prove it through the observable behaviour)
  const prevSig = RMBulk._signature();

  // simulate the search landing: cards change to the tumbler results
  setTimeout(() => { cards = ["tumbler-1", "tumbler-2", "tumbler-3", "tumbler-4"]; }, 300);

  const res = await RMBulk.waitForSearchResult(prevSig, 15000);
  chk("hasil pencarian terverifikasi walau ada node 'image-loading' nyangkut",
      res.ready === true, JSON.stringify(res));
  chk("jumlah kartu hasil terbaca", res.cards === 4, "cards=" + res.cards);

  // 2. a signature that never changes must still time out (no false positive)
  cards = ["diam-1", "diam-2"];
  const sigNow = RMBulk._signature();
  const stale = await RMBulk.waitForSearchResult(sigNow, 2500);
  chk("hasil yang tidak pernah berubah tetap ditolak (tidak asal terima)",
      stale.ready === false, JSON.stringify(stale));

  console.log(ok ? "\nLOADING GUARD LULUS — keyword scan tidak lagi digantung node 'loading'"
                 : "\nADA YANG GAGAL");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("GAGAL:", e); process.exit(1); });
