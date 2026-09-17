/* e2e-ledger.js — kunci LEARNING LEDGER (2026-09-17).
 * Model Fikri: winner dibiarkan, campaign rugi = learning cost yang HARUS
 * menghasilkan pelajaran. Vonis kunci: CR rendah=produk-salah vs CPC mahal=
 * creative-salah. Peringatkan produk baru yang mirip pola kalah.
 */
"use strict";
const fs = require("fs"), vm = require("vm");

const store = {};
const chrome = { storage: { local: {
  get: (k, cb) => cb(Object.fromEntries((Array.isArray(k)?k:[k]).map(x=>[x,store[x]]))),
  set: (o, cb) => { Object.assign(store,o); cb&&cb(); } } } };
const ctx = { console, chrome };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+"/../src/ledger.js","utf8"), ctx);
const RMLedger = ctx.window.RMLedger;

let ok=true; const chk=(n,c,d)=>{console.log(`${c?"PASS":"FAIL"}  ${n}${d?"  "+d:""}`);if(!c)ok=false;};

(async()=>{
  // reasoning wajib
  const bad = await RMLedger.add({ tag:"KupuA17" });
  chk("reasoning wajib (ditolak kalau kosong)", !!bad.error, bad.error||"");

  // catat beberapa eksperimen
  await RMLedger.add({ tag:"PolkadotMag", reasoning:"case magsafe lagi tren", concept:"before_after",
                       source:"plugin", product:{category:"Casing HP", price:115000, rating:4.9} });
  await RMLedger.add({ tag:"shellaSaukia", reasoning:"fashion muslim, bet impulse", concept:"pov",
                       source:"plugin", product:{category:"Fashion Muslim", price:125000, rating:4.6} });
  await RMLedger.add({ tag:"metal", reasoning:"aksesoris murah dari tiktok", source:"external",
                       product:{category:"Aksesoris", price:20000, rating:4.7} });
  chk("entri eksternal (download tiktok) tersimpan",
      (await RMLedger.all()).some(r=>r.source==="external"));

  // snapshot performa: PolkadotMag winner, shellaSaukia CR rendah (produk salah),
  // metal CR ok tapi EPC di bawah breakeven (creative salah)
  const snap = { tags: {
    PolkadotMag:  { clicks:99,  orders:9, epc:412, roas:2.06, conversionRate:9.1 },
    shellaSaukia: { clicks:157, orders:2, epc:60,  roas:0.18, conversionRate:1.3 },
    metal:        { clicks:157, orders:12,epc:110, roas:0.7,  conversionRate:7.6 }
  }};
  const rows = await RMLedger.classify(snap, { breakEvenCpc:130, crFloor:2.0 });
  const by = Object.fromEntries(rows.map(r=>[r.tag,r]));

  chk("PolkadotMag = WINNER", by.PolkadotMag.verdict==="WINNER", by.PolkadotMag.verdict);
  chk("shellaSaukia = LEARNING COST", by.shellaSaukia.verdict==="LEARNING COST");
  chk("shellaSaukia failure = PRODUK-salah (CR 1,3%)", by.shellaSaukia.failure_mode==="produk-salah",
      by.shellaSaukia.failure_mode);
  chk("metal failure = CREATIVE-salah (CR 7,6% tapi EPC<130)", by.metal.failure_mode==="creative-salah",
      by.metal.failure_mode);

  // lessons + warn
  // tambah satu lagi fashion muslim gagal produk supaya pola >=2
  await RMLedger.add({ tag:"halatiSlik", reasoning:"baju muslim lagi", concept:"pov",
                       source:"plugin", product:{category:"Fashion Muslim", price:132000, rating:4.5} });
  const snap2 = { tags: Object.assign({}, snap.tags, {
    halatiSlik: { clicks:78, orders:1, epc:20, roas:0.2, conversionRate:1.3 } }) };
  const w = await RMLedger.warn({category:"Fashion Muslim", price:120000}, snap2, {breakEvenCpc:130});
  console.log("  warn:", w && w.message);
  chk("warning muncul utk kategori pola-kalah", !!w && w.risk==="tinggi", w?w.risk:"null");

  // produk kategori bersih tidak diperingatkan
  const w2 = await RMLedger.warn({category:"Casing HP", price:25000}, snap2, {breakEvenCpc:130});
  chk("kategori winner TIDAK diperingatkan", w2===null);

  // CSV
  const csv = RMLedger.toCsv(rows);
  chk("CSV punya kolom verdict & failure_mode & reasoning",
      /verdict/.test(csv)&&/failure_mode/.test(csv)&&/reasoning/.test(csv));

  console.log(ok?"\nLEDGER OK":"\nADA YANG GAGAL");
  process.exit(ok?0:1);
})();
