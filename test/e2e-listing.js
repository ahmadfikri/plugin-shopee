/* e2e-listing.js — v0.9.27 listing-page summary (Product Offer / search page).
 * With the REAL snapshot:
 *   * every product gets p.decision from the SAME decide() as the product page
 *   * verdict counts add up, cards + ROAS forest plot + page test plan render
 *   * no NaN / undefined / null in the HTML
 *   * the drill-down panel (RMProductPage.build) shows the same verdict
 * Without a snapshot: old PRO summary + an explicit "impor snapshot" note.
 */
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");

const store = {};
const ctx = {
  window: {}, console,
  chrome: { storage: { local: {
    get: (k, cb) => cb(typeof k === "string" ? { [k]: store[k] } : {}),
    set: (o, cb) => { Object.assign(store, o); cb && cb(); },
    remove: (k, cb) => { delete store[k]; cb && cb(); }
  } } },
  localStorage: { getItem: () => null, setItem: () => {} },
  document: {
    createElement: () => ({ className: "", innerHTML: "", classList: { add() {}, toggle() {}, contains: () => false },
      querySelector: () => null, querySelectorAll: () => [], addEventListener() {} })
  }
};
ctx.window.document = ctx.document;
ctx.window.localStorage = ctx.localStorage;
vm.createContext(ctx);
for (const f of ["epc.js", "niche.js", "bandit.js", "perf.js", "proscore.js", "charts.js",
                 "shortlist.js", "analytics.js", "productpage.js", "panel.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), ctx);
}
const { RMAnalytics, RMPanel, RMProductPage, RMEpc } = ctx.window;
const SNAP = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "performance-snapshot-2026-10-21.json"), "utf8"));

let ok = true;
const chk = (n, c, d) => { console.log(`  ${c ? "OK  " : "FAIL"} ${n}${d ? " — " + d : ""}`); if (!c) ok = false; };

const cfg = { commissionPct: 10, breakEvenCPC: 130, conversionRate: 4, saturationTop3Pct: 50,
  momentumMaxAgeMonths: 12, momentumMinPerMonth: 50, showCharts: true, ai: { enabled: false } };
const mk = (id, name, price) => ({ id, name, price, unitsPerMonth: 200, soldTotal: 2000, rating: 4.8,
  reviewCount: 300, commissionPct: 8, hasVideo: false, shop: "toko", href: "https://shopee.co.id/x-i.1." + id });
const page = { keyword: "polkadot case", scrapedAt: new Date().toISOString(), products: [
  mk("1", "With box CTFY New Simple Polkadot Iphone case", 69000),
  mk("2", "Casetify Mirror Magnet Polkadot Colorful Tpu", 115000),
  mk("3", "Casing Samsung A55 motif bunga glossy", 25000),
  mk("4", "Rak bumbu dapur 3 susun", 45000),
  mk("5", "JFYOU 4/1PCS Celana Dalam Pria", 30000),
  mk("6", "Masker Duckbill Isi 50pcs 3Ply", 15000)
] };

// ---- with snapshot ----
const a = RMAnalytics.analyze(page, Object.assign({}, cfg, { __perf: SNAP }));
chk("tiap produk punya decision", a.products.every((p) => p.decision && Number.isFinite(p.decision.roas)),
    a.products.map((p) => `${p.id}:${p.decision && p.decision.action}`).join(" "));
// same engine as the product page
const p1 = a.products[0];
const d1 = RMProductPage.decide(p1.epcPred, SNAP, p1.suggestedTag, cfg);
chk("vonis listing == vonis halaman produk", d1.action === p1.decision.action &&
    Math.abs(d1.roas - p1.decision.roas) < 1e-9, `${d1.action} ${d1.roas.toFixed(2)}`);
chk("produk 'lainnya' (celana dalam/masker) tidak diprediksi untung",
    ["5", "6"].every((id) => { const d = a.products.find((p) => p.id === id).decision; return d.roas < 1; }));

const panel = RMPanel.build(a, cfg);
const html = panel.innerHTML;
chk("kartu baru tampil", /Uji dulu \(Thompson\)/.test(html) && /Prediksi ROAS terbaik/.test(html) &&
    /Max CPC Meta terbaik/.test(html) && /Niche di halaman ini/.test(html));
chk("kartu lama (PRO / Max CPC rumus) tidak tampil", !/Kandidat terbaik/.test(html) && !/Top produk — PRO SCORE/.test(html));
chk("forest plot ROAS tampil", /Prediksi ROAS per produk/.test(html) && /<svg class="rm-forest"/.test(html) && /balik modal 1x/.test(html));
chk("rencana uji halaman tampil", /rm-plan/.test(html) && /di halaman ini/.test(html));
const counts = (html.match(/<span class="rm-(?:green|yellow|red)">(\d+) (?:iklankan|layak coba|uji kecil|hati-hati|lewati)<\/span>/g) || [])
  .map((s) => Number(s.match(/>(\d+)/)[1])).reduce((x, y) => x + y, 0);
chk("jumlah vonis = jumlah produk", counts === a.products.length, `${counts} vs ${a.products.length}`);
chk("tanpa NaN/undefined/null", !/\bNaN\b|undefined|\bnull\b/.test(html),
    (html.match(/.{0,40}(NaN|undefined|\bnull\b).{0,40}/) || [""])[0]);

// drill-down panel on the listing uses the product-page builder
const dd = RMProductPage.build(p1, { name: p1.name, price: p1.price }, p1.pro, p1.epcPred, Object.assign({}, cfg, { __perf: SNAP }));
chk("drill-down = panel keputusan dengan vonis yang sama", dd.innerHTML.includes(`>${p1.decision.action}<`));

// ---- without snapshot ----
const b = RMAnalytics.analyze(page, cfg);
chk("tanpa snapshot: decision null", b.products.every((p) => p.decision == null));
const h2 = RMPanel.build(b, cfg).innerHTML;
chk("tanpa snapshot: ringkasan PRO lama + catatan impor", /Kandidat terbaik/.test(h2) && /Impor snapshot di Admin Panel/.test(h2));
chk("tanpa snapshot: tanpa NaN/undefined", !/\bNaN\b|undefined/.test(h2));

console.log(ok ? "\nLISTING LULUS" : "\nLISTING GAGAL");
process.exit(ok ? 0 : 1);
