/* e2e-epc-table.js — buktikan kolom EPC SCORE muncul di TABEL listing (MODE B),
 * bukan cuma di panel detail. Ini bug yang dilaporkan Fikri: "gak ada scoring baru
 * di plugin" — EPC dulu hanya dihitung di MODE A.
 *
 * Juga menguji: tanpa snapshot, sel EPC menampilkan hint "impor snapshot" yang
 * JELAS, bukan sel kosong (sel kosong terlihat seperti fitur rusak).
 */
"use strict";
const fs = require("fs"), vm = require("vm");

function loadInto(ctx, file) {
  vm.runInContext(fs.readFileSync(__dirname + "/../src/" + file, "utf8"), ctx);
}

// minimal DOM shim: panel.js only builds HTML strings + one createElement
const ctx = {
  window: {}, console,
  document: {
    createElement: () => ({ className: "", innerHTML: "",
      querySelector: () => null, querySelectorAll: () => [] })
  }
};
ctx.window.document = ctx.document;
vm.createContext(ctx);
loadInto(ctx, "epc.js");
loadInto(ctx, "perf.js");
loadInto(ctx, "proscore.js");
loadInto(ctx, "charts.js");
loadInto(ctx, "analytics.js");
loadInto(ctx, "panel.js");
const { RMEpc, RMAnalytics, RMPanel } = ctx.window;

const snapshot = {
  global: { clicks: 7857, orders: 342, commission: 980659, epc: 124.8 },
  tags: {
    KupuA17:        { clicks: 515, orders: 16, commission: 28039, epc: 54.4, trusted: true },
    kitchenCounter: { clicks: 396, orders: 17, commission: 61205, epc: 154.6, trusted: true },
    shellaSaukia:   { clicks: 155, orders: 2,  commission: 1158,  epc: 7.5,  trusted: true }
  }
};

const cfg = {
  commissionPct: 10, breakEvenCPC: 130, conversionRate: 4,
  saturationTop3Pct: 50, momentumMaxAgeMonths: 12, momentumMinPerMonth: 50,
  showCharts: false, ai: { enabled: false }
};

const snap = {
  keyword: "test", scrapedAt: new Date().toISOString(),
  products: [
    { id: "1.1", name: "Soft Case Samsung A17 KupuA17 motif", price: 25000,
      unitsPerMonth: 300, soldTotal: 3000, rating: 4.8, reviewCount: 500,
      commissionPct: 10, hasVideo: true, shop: "toko a", href: "#" },
    { id: "2.2", name: "Rak dapur kitchenCounter serbaguna", price: 55000,
      unitsPerMonth: 200, soldTotal: 2000, rating: 4.9, reviewCount: 800,
      commissionPct: 12, hasVideo: false, shop: "toko b", href: "#" },
    { id: "3.3", name: "Produk baru belum pernah diiklankan", price: 40000,
      unitsPerMonth: 100, soldTotal: 500, rating: 4.6, reviewCount: 90,
      commissionPct: 8, hasVideo: false, shop: "toko c", href: "#" }
  ]
};

let ok = true;
const chk = (n, c, d) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); if (!c) ok = false; };

// ---- WITH snapshot: every product must get an epcPred, table must show column
const withSnap = RMAnalytics.analyze(snap, Object.assign({}, cfg, { __perf: snapshot }));
chk("analytics melekatkan epcPred ke tiap produk",
    withSnap.products.every((p) => p.epcPred && typeof p.epcPred.score === "number"),
    withSnap.products.map((p) => p.epcPred && p.epcPred.score).join("/"));

const panel = RMPanel.build(withSnap, Object.assign({}, cfg, { __perf: snapshot }));
const html = panel.innerHTML;
chk("tabel punya header EPC SCORE", html.includes("EPC SCORE"));
chk("tabel menampilkan Rp/klik per baris", /Rp[\d.]+\/klik/.test(html));

for (const p of withSnap.products) {
  const e = p.epcPred;
  console.log(`  ${p.name.slice(0, 34).padEnd(34)} skor=${String(e.score).padStart(3)} `
    + `EPC Rp${Math.round(e.epc).toString().padStart(4)} basis=${e.basis} conf=${e.confidence}`);
}

// tag-matched products should differ from the pure-global new product
const kupu = withSnap.products.find((p) => /KupuA17/i.test(p.name));
const brand = withSnap.products.find((p) => /belum pernah/i.test(p.name));
chk("produk baru pakai prior global", brand.epcPred.basis === "global");
chk("produk ber-tag tidak identik dengan prior global",
    kupu.epcPred.basis === "tag" || kupu.epcPred.epc !== brand.epcPred.epc);

// ---- WITHOUT snapshot: explicit hint, not a blank cell
const noSnap = RMAnalytics.analyze(snap, cfg);
chk("tanpa snapshot epcPred null", noSnap.products.every((p) => p.epcPred == null));
const html2 = RMPanel.build(noSnap, cfg).innerHTML;
chk("tanpa snapshot tabel tetap punya kolom EPC", html2.includes("EPC SCORE"));
chk("tanpa snapshot ada hint 'impor snapshot'", html2.includes("impor snapshot"));

console.log(ok ? "\nEPC TABLE OK — skor EPC tampil di listing MODE B"
               : "\nADA YANG GAGAL");
process.exit(ok ? 0 : 1);
