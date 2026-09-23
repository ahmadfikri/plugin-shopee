/* e2e-epc-table.js — buktikan kolom EPC muncul di TABEL TUNGGAL (opsi B:
 * satu tabel riset kumulatif, product-table lama sudah dibuang), bukan cuma di
 * panel detail. Ini bug yang dilaporkan Fikri: "gak ada scoring baru di plugin".
 *
 * Juga menguji: entri tanpa EPC menampilkan hint "scan ulang" yang JELAS di
 * tabel, bukan sel kosong (sel kosong terlihat seperti fitur rusak).
 */
"use strict";
const fs = require("fs"), vm = require("vm");

function loadInto(ctx, file) {
  vm.runInContext(fs.readFileSync(__dirname + "/../src/" + file, "utf8"), ctx);
}

// minimal DOM shim: panel.js only builds HTML strings + one createElement
const store = {};
const ctx = {
  window: {}, console,
  chrome: { storage: { local: {
    get: (k, cb) => cb(typeof k === "string" ? { [k]: store[k] } : {}),
    set: (o, cb) => { Object.assign(store, o); cb && cb(); },
    remove: (k, cb) => { delete store[k]; cb && cb(); }
  } } },
  document: {
    createElement: () => ({ className: "", innerHTML: "",
      querySelector: () => null, querySelectorAll: () => [] })
  }
};
ctx.window.document = ctx.document;
ctx.self = ctx.window;
vm.createContext(ctx);
loadInto(ctx, "epc.js");
loadInto(ctx, "perf.js");
loadInto(ctx, "proscore.js");
loadInto(ctx, "charts.js");
loadInto(ctx, "shortlist.js");
loadInto(ctx, "analytics.js");
loadInto(ctx, "panel.js");
const { RMEpc, RMAnalytics, RMPanel, RMShortlist } = ctx.window;

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

(async () => {
  // ---- WITH snapshot: every product gets an epcPred, merged table shows it ----
  const withSnap = RMAnalytics.analyze(snap, Object.assign({}, cfg, { __perf: snapshot }));
  chk("analytics melekatkan epcPred ke tiap produk",
      withSnap.products.every((p) => p.epcPred && typeof p.epcPred.score === "number"),
      withSnap.products.map((p) => p.epcPred && p.epcPred.score).join("/"));

  // feed products into the single cumulative table, then render it
  await RMShortlist.add(withSnap.products, "cari: test");
  const meta = await RMShortlist.getMeta();
  const html = RMPanel.shortlistSection(meta, true);
  chk("tabel tunggal punya header EPC", html.includes(">EPC ") || /EPC<\/th>|EPC </.test(html) || html.includes("EPC"));
  chk("tabel menampilkan Rp/klik per baris", /Rp[\d.]+\/klik/.test(html));
  chk("tabel punya kolom Rating (dari product-table lama)", html.includes("Rating"));

  for (const p of withSnap.products) {
    const e = p.epcPred;
    console.log(`  ${p.name.slice(0, 34).padEnd(34)} skor=${String(e.score).padStart(3)} `
      + `EPC Rp${Math.round(e.epc).toString().padStart(4)} basis=${e.basis} conf=${e.confidence}`);
  }

  const kupu = withSnap.products.find((p) => /KupuA17/i.test(p.name));
  const brand = withSnap.products.find((p) => /belum pernah/i.test(p.name));
  chk("produk baru pakai prior global", brand.epcPred.basis === "global");
  chk("produk ber-tag tidak identik dengan prior global",
      kupu.epcPred.basis === "tag" || kupu.epcPred.epc !== brand.epcPred.epc);

  // ---- WITHOUT snapshot: explicit "scan ulang" hint, not a blank cell ----
  // Simulate an entry stored before a snapshot was imported (epcScore null).
  const bareMeta = { items: [{
    id: "9.9", name: "Produk tanpa snapshot", price: 30000, commissionPct: 6,
    pro: 40, action: "LAYAK COBA", maxCPC: 200, basis: "formula", rating: 4.5,
    epcScore: null, keyword: "cari: x", href: "#", at: Date.now()
  }], scans: 1, keywords: [] };
  const html2 = RMPanel.shortlistSection(bareMeta, true);
  chk("tanpa snapshot tabel tetap punya kolom EPC", html2.includes("EPC"));
  chk("tanpa snapshot ada hint 'scan ulang'", html2.includes("scan ulang"));

  console.log(ok ? "\nEPC TABLE OK — skor EPC tampil di tabel tunggal (opsi B)"
                 : "\nADA YANG GAGAL");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("GAGAL:", e); process.exit(1); });
