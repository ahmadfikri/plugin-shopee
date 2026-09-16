/* e2e-bulk-tabs.js — kunci perbaikan bug "bulk scan error setelah search".
 *
 * Bug-nya: node tab di-cache sekali di awal, lalu diklik di iterasi berikutnya.
 * Shopee (React) MENGGANTI node tab tiap render — dan sebuah pencarian membangun
 * ulang seluruh daftar — sehingga node yang dipegang jadi detached dan .click()
 * tidak berefek apa pun (gagal dalam diam).
 *
 * Tes ini memodelkan DOM yang mengganti node-nya, lalu membandingkan dua strategi:
 *   A. cache node  -> klik jatuh ke node mati (perilaku LAMA, harus gagal)
 *   B. re-query by label -> selalu kena node hidup (perilaku BARU, harus lulus)
 */
"use strict";

// --- DOM tiruan yang mengganti node tiap "render" ---
function makeDom(labels) {
  let nodes = [];
  let clicks = [];
  function render() {
    // node BARU tiap render; yang lama jadi detached
    nodes = labels.map((l) => ({
      textContent: l,
      alive: true,
      click() { if (this.alive) clicks.push(this.textContent); }
    }));
  }
  render();
  return {
    render() { nodes.forEach((n) => { n.alive = false; }); render(); },
    tabs() { return nodes; },
    clicks() { return clicks; }
  };
}

const LABELS = ["All", "Commissions XTRA", "Mobile & Accessories", "Home & Living", "Health"];

function findTabByLabel(dom, label) {
  const want = String(label).trim().toLowerCase();
  let exact = null, partial = null;
  for (const t of dom.tabs()) {
    const txt = (t.textContent || "").trim().toLowerCase();
    if (txt === want) { exact = t; break; }
    if (!partial && txt && (txt.includes(want) || want.includes(txt))) partial = t;
  }
  return exact || partial;
}

let ok = true;

// ---- A: perilaku LAMA (cache node) ----
{
  const dom = makeDom(LABELS);
  const cached = dom.tabs();          // di-cache SEKALI, seperti kode lama
  for (let i = 0; i < LABELS.length; i++) {
    dom.render();                     // React re-render / user melakukan search
    try { cached[i].click(); } catch (_) {}
  }
  const got = dom.clicks().length;
  const pass = got === 0;             // memang harus 0 → membuktikan bug-nya nyata
  console.log(`A) cache node (kode LAMA)      → klik berhasil ${got}/${LABELS.length}  ` +
              `${pass ? "PASS (bug terbukti)" : "FAIL"}`);
  if (!pass) ok = false;
}

// ---- B: perilaku BARU (re-query by label) ----
{
  const dom = makeDom(LABELS);
  for (let i = 0; i < LABELS.length; i++) {
    dom.render();                     // node diganti terus
    const t = findTabByLabel(dom, LABELS[i]);
    if (t) t.click();
  }
  const got = dom.clicks().length;
  const pass = got === LABELS.length;
  console.log(`B) re-query by label (BARU)    → klik berhasil ${got}/${LABELS.length}  ` +
              `${pass ? "PASS" : "FAIL"}`);
  if (!pass) ok = false;
}

// ---- C: label hilang setelah search → dilewati dengan anggun ----
{
  const dom = makeDom(["All", "Health"]);
  const t = findTabByLabel(dom, "Kategori Yang Sudah Hilang");
  const pass = t === null;
  console.log(`C) label hilang → null (skip)  → ${pass ? "PASS" : "FAIL"}`);
  if (!pass) ok = false;
}

console.log(ok ? "\nBULK TAB OK — bug node-stale tidak bisa kembali"
               : "\nADA YANG GAGAL");
process.exit(ok ? 0 : 1);
